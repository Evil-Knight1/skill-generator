// src/skillsGenerator.ts
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs/promises';
import axios from 'axios';
import * as cheerio from 'cheerio';
import TurndownService from 'turndown';

export interface GenerateOptions {
    outputDir: string;
    flatStructure: boolean;
    crawlDependencies?: boolean;
    renameFile?: string;
    rules?: Array<{
        urlPattern: string;
        subpaths: boolean;
        action: 'include' | 'ignore';
    }>;
}

export class SkillsGenerator {
    private turndownService: TurndownService;

    constructor() {
        this.turndownService = new TurndownService({
            headingStyle: 'atx',
            codeBlockStyle: 'fenced',
        });
        this.turndownService.addRule('removeScripts', {
            filter: ['script', 'style', 'nav', 'header', 'footer', 'aside'],
            replacement: () => ''
        });
    }

    private slugify(text: string): string {
        return text
            .toLowerCase()
            .trim()
            .replace(/[^a-z0-9\s-]/g, '')
            .replace(/[\s_-]+/g, '-')
            .replace(/^-+|-+$/g, '');
    }

    private async extractTitleAndDescription($: cheerio.CheerioAPI, url: string): Promise<{ title: string; description: string }> {
        let title = $('h1').first().text().trim() || $('title').first().text().trim() || 'Untitled Skill';
        title = title.split('|')[0].trim();

        let description = '';
        $('main p, article p, .content p, .markdown-body p').each((_, el) => {
            const text = $(el).text().trim();
            if (text.length > 60 && text.length < 400) {
                description = text;
                return false;
            }
        });

        if (!description) {
            description = `Documentation and guides for ${title}. Extracted from ${new URL(url).hostname}.`;
        }

        return { title, description };
    }

    async generateFromUrl(
        baseUrl: string, 
        options: GenerateOptions, 
        onProgress?: (msg: string) => void,
        token?: vscode.CancellationToken
    ): Promise<{ folderPath: string; skillName: string }> {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) throw new Error('Please open a workspace folder first');

        const baseOutput = path.join(workspaceFolder.uri.fsPath, options.outputDir);
        await fs.mkdir(baseOutput, { recursive: true });

        // Load DB
        const dbPath = path.join(baseOutput, '.crawled_db.json');
        let previouslyCrawled: string[] = [];
        try {
            const dbContent = await fs.readFile(dbPath, 'utf8');
            previouslyCrawled = JSON.parse(dbContent);
        } catch (e) {
            // No DB file yet, which is fine
        }
        
        onProgress?.(`Fetching main page: ${baseUrl}`);
        
        // Ensure https
        if (!baseUrl.startsWith('http')) {
            baseUrl = 'https://' + baseUrl;
        }

        const response = await axios.get(baseUrl, { timeout: 15000 });
        const $ = cheerio.load(response.data);
        const { title, description } = await this.extractTitleAndDescription($, baseUrl);

        const folderName = this.slugify(title);
        
        let rootSkillFolder = path.join(baseOutput, folderName);
        if (options.flatStructure) {
            rootSkillFolder = baseOutput; // Flat outputs straight to output directory
            rootSkillFolder = path.join(baseOutput, folderName);
        }

        await fs.mkdir(rootSkillFolder, { recursive: true });

        // Initialize tracking
        const visited = new Set<string>();
        // Check if DB already logged the baseUrl
        if (!previouslyCrawled.includes(baseUrl)) {
           // We'll crawl it normally
        }

        const queue: { url: string; depth: number }[] = [{ url: baseUrl, depth: 0 }];

        let contentMarkdown = '';
        const crawledData: { url: string; title: string; content: string }[] = [];
        let pagesCrawled = 0;

        while (queue.length > 0) {
            if (token?.isCancellationRequested) {
                onProgress?.('Crawling manually stopped. Processing gathered data...');
                break;
            }

            const { url: current, depth } = queue.shift()!;

            // Skip if already visited across current session OR previous sessions
            if (visited.has(current) || previouslyCrawled.includes(current)) continue;
            
            if (!this.shouldCrawl(current, options.rules || [])) continue;

            visited.add(current);
            pagesCrawled++;
            onProgress?.(`Crawled ${pagesCrawled} of ${queue.length + pagesCrawled} pages - ${new URL(current).pathname}`);

            try {
                const res = await axios.get(current, { timeout: 10000 });
                const page$ = cheerio.load(res.data);

                const pageTitle = page$('h1').first().text().trim() || 'Section';
                
                // Smart content selection for pub.dev/npmjs
                let pageContent = '';
                if (current.includes('pub.dev') || current.includes('npmjs.com')) {
                    pageContent = page$('.detail-tabs-content, .markdown-body, #readme').html() || page$('main').html() || '';
                } else {
                    pageContent = page$('main, article, .content, #content, .markdown-body').first().html() || '';
                }

                if (pageContent) {
                    let md = this.turndownService.turndown(pageContent);
                    if (options.flatStructure) {
                        crawledData.push({ url: current, title: pageTitle, content: md });
                    } else {
                        contentMarkdown += `\n\n## ${pageTitle}\n\n**URL:** ${current}\n\n${md}\n\n---\n`;
                    }
                }

                // Unbounded Sub-links discovery
                page$('a[href]').each((_, el) => {
                    let href = page$(el).attr('href') || '';
                    if (!href || href.startsWith('#')) return;

                    if (href.startsWith('/')) {
                        const base = new URL(current);
                        href = `${base.origin}${href}`;
                    }
                    if (!href.startsWith('http')) return;

                    const currentUrlObj = new URL(current);
                    const targetUrlObj = new URL(href);
                    
                    // Strict domain checking
                    if (targetUrlObj.hostname !== currentUrlObj.hostname) return;

                    // If "Crawl Dependencies" is ON and it's a pub.dev package, gather install/example/changelog tabs
                    if (options.crawlDependencies && (current.includes('pub.dev/packages') || current.includes('npmjs.com/package'))) {
                        // Only include tabs of the same package, avoid wandering to different packages
                        if (!targetUrlObj.pathname.startsWith(currentUrlObj.pathname.split('/').slice(0, 3).join('/'))) {
                            return;
                        }
                    }

                    if (!visited.has(href) && !previouslyCrawled.includes(href)) {
                        queue.push({ url: href, depth: depth + 1 });
                    }
                });
            } catch (e: any) {
                console.warn(`Failed to crawl ${current}: ${e.message}`);
            }
        }

        const fileName = options.renameFile || 'skills.md';

        if (crawledData.length > 0 || contentMarkdown.length > 0) {
            onProgress?.(`Saving logic structures...`);
            
            if (options.flatStructure) {
                for (let i = 0; i < crawledData.length; i++) {
                    const page = crawledData[i];
                    let subFolder = this.slugify(page.title);
                    if (!subFolder) subFolder = `topic-${i}`;
                    
                    const pageFolder = path.join(rootSkillFolder, subFolder);
                    await fs.mkdir(pageFolder, { recursive: true });
                    
                    const pageMarkdown = `skill_name: ${page.title}\ndescription: Guide on ${page.title} extracted from ${page.url}\n\n---\n\n${page.content}\n`;
                    await fs.writeFile(path.join(pageFolder, fileName), pageMarkdown, 'utf-8');
                }
            } else {
                const finalMarkdown = `skill_name: ${title}\ndescription: ${description}\n\n---\n\n${contentMarkdown || 'Content could not be extracted.'}\n`;
                await fs.writeFile(path.join(rootSkillFolder, fileName), finalMarkdown, 'utf-8');
            }

            // Save the newly added URLs to DB
            const updatedDb = Array.from(new Set([...previouslyCrawled, ...Array.from(visited)]));
            await fs.writeFile(dbPath, JSON.stringify(updatedDb, null, 2), 'utf-8');
            
            onProgress?.(`Done! Logged ${visited.size} new pages to database.`);
        } else {
            onProgress?.(`No new pages crawled (all were previously cached) or operation aborted.`);
        }

        if (token?.isCancellationRequested) {
            throw new Error('Cancelled');
        }

        return {
            folderPath: rootSkillFolder,
            skillName: title
        };
    }

    private shouldCrawl(url: string, rules: any[]): boolean {
        for (const rule of rules) {
            if (url.includes(rule.urlPattern)) {
                return rule.action === 'include';
            }
        }
        return true; 
    }
}