import { useRef, useState, type ReactNode } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeHighlight from 'rehype-highlight'
import { Copy, Check } from 'lucide-react'

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
        components={{ pre: ({ children }) => <CodeBlock>{children}</CodeBlock> }}
      >
        {children}
      </ReactMarkdown>
    </div>
  )
}

/** A code block with a copy button, like ChatGPT's. Copies the rendered text. */
function CodeBlock({ children }: { children?: ReactNode }): JSX.Element {
  const ref = useRef<HTMLPreElement>(null)
  const [copied, setCopied] = useState(false)

  const copy = (): void => {
    const text = ref.current?.innerText ?? ''
    void window.api.copyText(text)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1200)
  }

  return (
    <div className="group/code relative">
      <pre ref={ref}>{children}</pre>
      <button
        onClick={copy}
        aria-label={copied ? 'Copied' : 'Copy code'}
        className="absolute right-2 top-2 grid size-7 place-items-center rounded-md border border-border bg-surface-raised text-muted-foreground transition-colors hover:text-foreground"
      >
        {copied ? <Check className="size-3.5 text-status-done" /> : <Copy className="size-3.5" />}
      </button>
    </div>
  )
}
