import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeHighlight from 'rehype-highlight'

/**
 * Renders agent message text as GitHub-flavored markdown with syntax-highlighted
 * code blocks. Raw HTML is intentionally NOT rendered (react-markdown escapes it),
 * so untrusted transcript content can't inject markup. Styling lives in the `.md`
 * block in globals.css.
 */
export function Markdown({ children }: { children: string }): JSX.Element {
  return (
    <div className="md">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[[rehypeHighlight, { detect: true, ignoreMissing: true }]]}
      >
        {children}
      </ReactMarkdown>
    </div>
  )
}
