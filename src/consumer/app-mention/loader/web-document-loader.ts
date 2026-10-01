import { BaseDocumentLoader } from '@langchain/core/document_loaders/base';
import { Document } from '@langchain/core/documents';
import { AsyncCaller } from '@langchain/core/utils/async_caller';
import { load } from 'cheerio';

import type { DocumentLoader } from '@langchain/core/document_loaders/base';
import type { AsyncCallerParams } from '@langchain/core/utils/async_caller';

const concatUrl = (url: string, path: string) => {
  try {
    return new URL(path, url).toString();
  } catch {
    return '';
  }
};

const createLinkText = (url: string, text: string) => {
  if (url && text) {
    return `<${url}|${text}>`;
  }

  if (url) {
    return `<${url}>`;
  }

  return text;
};

export class NonHTMLContentError extends Error {
  constructor() {
    super('Cannot summarize non-HTML content.');
  }
}

export interface WebDocumentLoaderParameters extends AsyncCallerParams {
  url: string;
}

export class WebDocumentLoader extends BaseDocumentLoader implements DocumentLoader {
  private readonly url: string;

  private readonly caller: AsyncCaller;

  public constructor({
    url,
    ...caller
  }: WebDocumentLoaderParameters) {
    super();

    this.url = url;
    this.caller = new AsyncCaller(caller);
  }

  public async load(): Promise<Document[]> {
    const html = await this.fetchHtml(this.url);
    const text = this.scrape(html);

    return [new Document({
      pageContent: text,
      metadata: {
        source: this.url,
      },
    })];
  }

  private async fetchHtml(url: string): Promise<string> {
    const response = await this.caller.call(fetch, url);
    if (!response.headers.get('content-type')?.startsWith('text/html')) {
      throw new NonHTMLContentError();
    }
    return await response.text();
  }

  private scrape(html: string): string {
    let text = '';
    const $ = load(html);

    $('body *:not(style):not(script):not(svg)').each((_, element) => {
      const $element = $(element);
      const tagName = $element.prop('tagName')?.toLowerCase();
      const content = $element.clone().children().remove().end().text().trim();

      switch (tagName) {
        case 'a': {
          let href = $element.attr('href') || '';

          if (!href.startsWith('http')) {
            href = concatUrl(this.url, href);
          }

          text += ` ${createLinkText(href, content)} `;
          break;
        }
        case 'img': {
          let source = $element.attr('src') || '';
          const alt = $element.attr('alt') || '';

          if (!source.startsWith('http')) {
            source = concatUrl(this.url, source);
          }

          text += ` ${createLinkText(source, alt)} `;
          break;
        }
        default: {
          if (content) {
            text += ` ${content}`;
          }
          break;
        }
      }
    });

    return text.trim().replaceAll(/\n+/g, ' ');
  }
}
