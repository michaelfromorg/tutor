import { FormEventHandler, useCallback, useEffect, useRef, useState, Dispatch, SetStateAction } from 'react'
import { DefaultSpinner, Editor, Tldraw } from 'tldraw'
import { useTldrawAiExample, onAiThinking } from './useTldrawAiExample'

type Message = {
	id: string
	role: 'user' | 'assistant'
	content: string
	strategy?: string
	intents?: string[]
}

function App() {
	const [editor, setEditor] = useState<Editor | null>(null)
	const [isChatOpen, setIsChatOpen] = useState(true)
	const [messages, setMessages] = useState<Message[]>([])
	const SIDEBAR_WIDTH = 260

	const toggleChat = useCallback(() => setIsChatOpen((v) => !v), [])

	// Toggle chat with Ctrl+\ or Cmd+\
	useEffect(() => {
		const handler = (e: KeyboardEvent) => {
			if ((e.ctrlKey || e.metaKey) && e.key === "\\") {
				e.preventDefault()
				toggleChat()
			}
		}
		window.addEventListener('keydown', handler)
		return () => window.removeEventListener('keydown', handler)
	}, [toggleChat])

	useEffect(() => {
		if (!editor) return
		editor.updateInstanceState({ isGridMode: true })
	}, [editor])

	return (
		<div
			className="tldraw-ai-container"
			style={{ gridTemplateColumns: isChatOpen ? `1fr ${SIDEBAR_WIDTH}px` : '1fr' }}
		>
			<Tldraw persistenceKey="tldraw-ai-demo-2" onMount={setEditor} />
			{editor && isChatOpen && (
				<ChatSidebar editor={editor} messages={messages} setMessages={setMessages} />
			)}

			{/* Toggle button */}
			<button className="chat-toggle" onClick={toggleChat}>
				{isChatOpen ? '✕' : '💬'}
			</button>
		</div>
	)
}

function InputBar({ editor, setMessages }: { editor: Editor; setMessages: Dispatch<SetStateAction<Message[]>> }) {
	const ai = useTldrawAiExample(editor)
	const nanoid = () => Math.random().toString(36).slice(2, 9)

	// The state of the prompt input, either idle or loading with a cancel callback
	const [isGenerating, setIsGenerating] = useState(false)

	// A stashed cancel function that we can call if the user clicks the button while loading
	const rCancelFn = useRef<(() => void) | null>(null)

	// Put the editor and ai helpers onto the window for debugging. You can run commands like `ai.prompt('draw a unicorn')` in the console.
	useEffect(() => {
		if (!editor) return
		;(window as any).editor = editor
		;(window as any).ai = ai
	}, [ai, editor])

	const handleSubmit = useCallback<FormEventHandler<HTMLFormElement>>(
		async (e) => {
			e.preventDefault()

			if (rCancelFn.current) {
				rCancelFn.current()
				rCancelFn.current = null
				setIsGenerating(false)
				return
			}

			const formData = new FormData(e.currentTarget)
			const value = formData.get('input') as string

			// push user message
			const userMsg: Message = { id: nanoid(), role: 'user', content: value }
			setMessages((msgs: Message[]) => [...msgs, userMsg])

			// provisional assistant message
			const assistId = nanoid()
			setMessages((msgs: Message[]) => [...msgs, { id: assistId, role: 'assistant', content: 'Thinking…', strategy: '', intents: [] }])

			try {
				const { promise, cancel } = ai.prompt({ message: value, stream: true }) as any
				rCancelFn.current = cancel

                let firstChunk = true
                const unsubscribe = onAiThinking((change: any) => {
                    const desc = (change as any).description ?? ''
                    if (!desc) return
                    setMessages((prev) =>
                        prev.map((m) => {
                            if (m.id !== assistId) return m
                            if (firstChunk) {
                                firstChunk = false
                                return { ...m, strategy: desc }
                            }
                            return { ...m, intents: [...(m.intents ?? []), desc] }
                        })
                    )
                })
				setIsGenerating(true)

				await promise

				setIsGenerating(false)
				rCancelFn.current = null

				setMessages((msgs: Message[]) =>
					msgs.map((msg: Message) => (msg.id === assistId ? { ...msg, content: 'Done ✅' } : msg))
				)
			} catch (err) {
				console.error(err)
				setIsGenerating(false)
				rCancelFn.current = null
			}
		}, [ai, setMessages]
	)

	return (
		<div className="prompt-input">
			<form onSubmit={handleSubmit}>
				<input name="input" type="text" autoComplete="off" placeholder="Enter your prompt…" />
				<button>{isGenerating ? <DefaultSpinner /> : 'Send'}</button>
			</form>
		</div>
	)
}

function ChatSidebar({ editor, messages, setMessages }: { editor: Editor; messages: Message[]; setMessages: Dispatch<SetStateAction<Message[]>> }) {
	const endRef = useRef<HTMLDivElement>(null)
	useEffect(() => {
		endRef.current?.scrollIntoView({ behavior: 'smooth' })
	}, [messages])

	return (
		<div className="chat-sidebar">
			<div className="chat-log">
				{messages.map((m) => (
					<div key={m.id} className={`bubble ${m.role}`}>
						<p>{m.content}</p>
						{m.role === 'assistant' && (m.strategy || (m.intents && m.intents.length > 0)) && (
							<details>
								<summary>AI Strategy & Actions</summary>
								{m.strategy && (
									<div className="strategy-section">
										<strong>Strategy</strong>
										<p>{m.strategy}</p>
									</div>
								)}
								{m.intents && m.intents.length > 0 && (
									<div className="intents-section">
										<strong>Actions Taken</strong>
										<ul className="intents-list">
											{m.intents.map((intent, i) => (
												<li key={i} className="intent-item">{intent}</li>
											))}
										</ul>
									</div>
								)}
							</details>
						)}
					</div>
				))}
				<div ref={endRef} />
			</div>
			<InputBar editor={editor} setMessages={setMessages} />
		</div>
	)
}

export default App
