import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';

interface MarkdownRendererProps {
  content: string;
  className?: string;
}

const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({ content, className }) => {
  // Preprocess content to ensure limit subscripts (h->0) appear underneath the symbol (\lim\limits)
  // This fixes the issue where inline math renders limits to the side
  // Regex explanation: Match \lim NOT followed by a letter (like \limit) OR \limits (to avoid double application)
  const processedContent = React.useMemo(() => {
    if (!content) return '';
    return content.replace(/\\lim(?!(?:[a-zA-Z]|\s*\\limits))/g, '\\lim\\limits');
  }, [content]);

  return (
    <div className={`prose prose-slate max-w-none prose-p:my-2 prose-headings:my-3 ${className}`}>
      <ReactMarkdown
        remarkPlugins={[remarkMath]}
        rehypePlugins={[rehypeKatex]}
        components={{
          // Override paragraph to avoid hydration errors with some math blocks
          p: ({ node, children, ...props }) => <p className="leading-relaxed text-slate-800 mb-2 last:mb-0" {...props}>{children}</p>,
          // Override blockquote to style it as a "Box" (<보기>)
          blockquote: ({ node, children, ...props }) => (
            <div className="border border-slate-500 p-4 my-6 rounded-sm bg-white text-slate-900 not-italic shadow-[2px_2px_0px_0px_rgba(0,0,0,0.05)] print:shadow-none print:border-black" {...props}>
              {children}
            </div>
          )
        }}
      >
        {processedContent}
      </ReactMarkdown>
    </div>
  );
};

export default MarkdownRenderer;