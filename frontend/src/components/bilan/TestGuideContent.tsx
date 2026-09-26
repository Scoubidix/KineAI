'use client';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

/**
 * Rendu du texte d'une fiche test. Partagé par la fiche kiné et l'aperçu admin : ce que
 * l'admin prévisualise est exactement ce que le kiné lit.
 * Pas de rehype-raw : le HTML brut du texte est ignoré. Pas d'images tierces.
 */
export default function TestGuideContent({ content }: { content: string }) {
  return (
    <div className="space-y-2 text-sm leading-relaxed text-foreground">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        disallowedElements={['img']}
        components={{
          p: ({ children }) => <p className="whitespace-pre-wrap">{children}</p>,
          ul: ({ children }) => <ul className="list-disc space-y-1 pl-5">{children}</ul>,
          ol: ({ children }) => <ol className="list-decimal space-y-1 pl-5">{children}</ol>,
          h1: ({ children }) => <h3 className="mt-3 text-sm font-semibold">{children}</h3>,
          h2: ({ children }) => <h3 className="mt-3 text-sm font-semibold">{children}</h3>,
          h3: ({ children }) => <h3 className="mt-3 text-sm font-semibold">{children}</h3>,
          strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
          a: ({ href, children }) => (
            <a href={href} target="_blank" rel="noopener noreferrer" className="text-[#3899aa] underline underline-offset-2">
              {children}
            </a>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
