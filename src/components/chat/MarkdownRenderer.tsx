import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Copy, Check, ExternalLink, Terminal, Code2 } from 'lucide-react';

interface MarkdownRendererProps {
  content: string;
  isStreaming?: boolean;
}

interface CodeBlockProps {
  language?: string;
  code: string;
}

const CodeBlock: React.FC<CodeBlockProps> = ({ language, code }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(code);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = code;
        textarea.style.position = 'fixed';
        textarea.style.left = '-999999px';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.warn('Copy to clipboard failed:', err);
    }
  };

  const rawLang = language ? language.replace(/^language-/, '').trim() : '';
  const displayLang = rawLang ? rawLang.toUpperCase() : 'CODE';

  return (
    <div className="my-3.5 rounded-xl overflow-hidden border border-[#2D2D32] bg-[#141416] text-[#E4E4E7] shadow-sm">
      {/* Code Header Bar */}
      <div className="flex items-center justify-between px-3.5 py-2 bg-[#1C1C1F] border-b border-[#2D2D32] text-xs font-mono text-[#A1A1AA]">
        <div className="flex items-center gap-1.5">
          <Terminal className="w-3.5 h-3.5 text-[#C66A3D]" />
          <span className="font-semibold tracking-wider text-[11px] text-[#D4D4D8]">
            {displayLang}
          </span>
        </div>
        <button
          type="button"
          onClick={handleCopy}
          className="flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-medium hover:text-[#FFFFFF] hover:bg-[#2B2B30] transition-colors cursor-pointer text-[#A1A1AA]"
          title="Copy code"
        >
          {copied ? (
            <>
              <Check className="w-3.5 h-3.5 text-[#34D399]" />
              <span className="text-[#34D399] font-sans font-medium">Copied!</span>
            </>
          ) : (
            <>
              <Copy className="w-3.5 h-3.5" />
              <span className="font-sans">Copy</span>
            </>
          )}
        </button>
      </div>

      {/* Code Content */}
      <div className="p-3.5 sm:p-4 overflow-x-auto text-[13px] font-mono leading-relaxed selection:bg-[#C66A3D]/40">
        <pre className="m-0 p-0 font-mono whitespace-pre">{code}</pre>
      </div>
    </div>
  );
};

export const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({ content }) => {
  if (!content || !content.trim()) {
    return null;
  }

  return (
    <div className="chatgpt-markdown text-[#1F1E1B] leading-relaxed break-words space-y-3 text-sm md:text-[15px]">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          // Headings
          h1: ({ children }) => (
            <h1 className="text-xl md:text-2xl font-bold tracking-tight text-[#1F1E1B] mt-5 mb-2.5 pb-1 border-b border-[#E5E2DC]/60 font-sans first:mt-0">
              {children}
            </h1>
          ),
          h2: ({ children }) => (
            <h2 className="text-lg md:text-xl font-bold tracking-tight text-[#1F1E1B] mt-4 mb-2 font-sans first:mt-0">
              {children}
            </h2>
          ),
          h3: ({ children }) => (
            <h3 className="text-base md:text-lg font-semibold tracking-tight text-[#1F1E1B] mt-3.5 mb-1.5 font-sans first:mt-0">
              {children}
            </h3>
          ),
          h4: ({ children }) => (
            <h4 className="text-sm md:text-base font-semibold text-[#1F1E1B] mt-3 mb-1 font-sans first:mt-0">
              {children}
            </h4>
          ),

          // Paragraphs
          p: ({ children }) => (
            <p className="my-2 leading-[1.68] text-[#2C2A26] first:mt-0 last:mb-0">
              {children}
            </p>
          ),

          // Bold & Italic
          strong: ({ children }) => (
            <strong className="font-semibold text-[#141412]">{children}</strong>
          ),
          em: ({ children }) => (
            <em className="italic text-[#383530]">{children}</em>
          ),

          // Lists
          ul: ({ children }) => (
            <ul className="my-2.5 ml-4 sm:ml-5 space-y-1.5 list-disc list-outside text-[#2C2A26] marker:text-[#8C8880]">
              {children}
            </ul>
          ),
          ol: ({ children }) => (
            <ol className="my-2.5 ml-4 sm:ml-5 space-y-1.5 list-decimal list-outside text-[#2C2A26] marker:text-[#8C8880] marker:font-medium">
              {children}
            </ol>
          ),
          li: ({ children }) => (
            <li className="pl-1 leading-[1.62]">{children}</li>
          ),

          // Task lists / Checkboxes
          input: ({ type, checked, ...props }) => {
            if (type === 'checkbox') {
              return (
                <input
                  type="checkbox"
                  checked={checked}
                  readOnly
                  className="mr-2 h-3.5 w-3.5 rounded border-[#C5C2BA] text-[#C66A3D] focus:ring-0 focus:ring-offset-0 cursor-default align-middle"
                  {...props}
                />
              );
            }
            return <input type={type} {...props} />;
          },

          // Blockquotes
          blockquote: ({ children }) => (
            <blockquote className="my-3.5 border-l-3 border-[#C66A3D] bg-[#FAF8F5] pl-4 pr-3.5 py-2 rounded-r-xl text-[#3D3A35] italic text-sm leading-relaxed">
              {children}
            </blockquote>
          ),

          // Dividers
          hr: () => <hr className="my-4 border-0 border-t border-[#E5E2DC]" />,

          // Links
          a: ({ href, children }) => {
            const isExternal = href?.startsWith('http://') || href?.startsWith('https://');
            return (
              <a
                href={href}
                target={isExternal ? '_blank' : undefined}
                rel={isExternal ? 'noopener noreferrer' : undefined}
                className="text-[#C66A3D] hover:text-[#A74E23] hover:underline underline-offset-2 font-medium inline-flex items-center gap-0.5 break-all transition-colors"
              >
                <span>{children}</span>
                {isExternal && <ExternalLink className="w-3 h-3 inline-block shrink-0 opacity-75 ml-0.5" />}
              </a>
            );
          },

          // Inline & Fenced Code
          code: (props: any) => {
            const { inline, className, children } = props;
            const match = /language-(\w+)/.exec(className || '');
            const codeContent = String(children).replace(/\n$/, '');

            // If it's a code block (multiline or has language class)
            if (!inline && (match || codeContent.includes('\n'))) {
              return <CodeBlock language={match ? match[1] : undefined} code={codeContent} />;
            }

            // Inline code
            return (
              <code className="px-1.5 py-0.5 rounded-md bg-[#ECE9E2] text-[#A74E23] border border-[#DFDBD2] font-mono text-[13px] font-medium selection:bg-[#C66A3D]/20">
                {children}
              </code>
            );
          },

          // Tables (Contained in dedicated responsive wrapper)
          table: ({ children }) => (
            <div className="my-4 w-full overflow-x-auto rounded-xl border border-[#E5E2DC] bg-[#FFFFFF] shadow-2xs">
              <table className="w-full border-collapse text-left text-sm">
                {children}
              </table>
            </div>
          ),
          thead: ({ children }) => (
            <thead className="bg-[#F6F5F1] border-b border-[#E5E2DC] text-xs font-semibold text-[#1F1E1B] uppercase tracking-wider">
              {children}
            </thead>
          ),
          tbody: ({ children }) => (
            <tbody className="divide-y divide-[#E5E2DC]/60 text-[#383733]">
              {children}
            </tbody>
          ),
          tr: ({ children }) => (
            <tr className="hover:bg-[#FAF9F5]/80 transition-colors">
              {children}
            </tr>
          ),
          th: ({ children }) => (
            <th className="px-4 py-2.5 font-semibold text-[#1F1E1B] text-xs sm:text-[13px] whitespace-nowrap">
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="px-4 py-2.5 text-xs sm:text-sm text-[#383733] leading-normal align-top">
              {children}
            </td>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
};
