import { FormEventHandler, useCallback, useEffect, useRef, useState, Dispatch, SetStateAction } from 'react'
import { DefaultSpinner, Editor, Tldraw, DefaultMainMenu, DefaultMainMenuContent, TldrawUiMenuItem, TldrawUiMenuGroup, TLComponents } from 'tldraw'
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
	const [homeworkQuestion, setHomeworkQuestion] = useState<string | null>(null)
	const [pageTitle, setPageTitle] = useState<string>('Homework Helper')
	const [showModal, setShowModal] = useState(false)
	const [showQuestionPanel, setShowQuestionPanel] = useState(false)
	const SIDEBAR_WIDTH = 260

	const toggleChat = useCallback(() => setIsChatOpen((v) => !v), [])
	const toggleQuestionPanel = useCallback(() => setShowQuestionPanel((v) => !v), [])

	// Load homework question from localStorage on mount
	useEffect(() => {
		const saved = localStorage.getItem('homework-question')
		const savedTitle = localStorage.getItem('homework-title')
		if (saved) {
			setHomeworkQuestion(saved)
			setPageTitle(savedTitle || 'Homework Helper')
			setShowQuestionPanel(true)
		} else {
			setShowModal(true)
		}
	}, [])

	// Save homework question to localStorage
	useEffect(() => {
		if (homeworkQuestion) {
			localStorage.setItem('homework-question', homeworkQuestion)
			localStorage.setItem('homework-title', pageTitle)
		}
	}, [homeworkQuestion, pageTitle])

	// Update document title
	useEffect(() => {
		document.title = pageTitle
	}, [pageTitle])

	// Generate AI title from homework question
	const generateTitle = useCallback(async (question: string) => {
		// Always create a fallback title first
		const fallbackTitle = question.split(' ').slice(0, 4).join(' ') + '...'
		setPageTitle(fallbackTitle)

		if (!editor) return
		
		const ai = useTldrawAiExample(editor)
		try {
			const { promise } = ai.prompt({ 
				message: `Generate a short 3-6 word title for this homework question: "${question}". Only respond with the title, nothing else.`, 
				stream: false 
			}) as any
			
			await promise
			// For now, we'll use the fallback title since the AI response processing 
			// would need more complex integration. The fallback provides good UX.
			console.log('Title generation completed')
		} catch (err) {
			console.log('Title generation failed, using fallback')
		}
	}, [editor])

	// Handle homework question submission
	const handleHomeworkSubmit = useCallback((question: string) => {
		setHomeworkQuestion(question)
		setShowModal(false)
		setShowQuestionPanel(true)
		generateTitle(question)
	}, [generateTitle])

	// Custom main menu component
	const CustomMainMenu = useCallback(() => {
		return (
			<DefaultMainMenu>
				<TldrawUiMenuGroup id="homework">
					{homeworkQuestion && (
						<TldrawUiMenuItem
							id="toggle-question"
							label={showQuestionPanel ? "Hide Question" : "Show Question"}
							icon={showQuestionPanel ? "minus" : "plus"}
							readonlyOk
							onSelect={toggleQuestionPanel}
						/>
					)}
					<TldrawUiMenuItem
						id="new-homework"
						label="New Homework"
						icon="edit"
						readonlyOk
						onSelect={() => {
							setHomeworkQuestion(null)
							setShowQuestionPanel(false)
							setPageTitle('Homework Helper')
							localStorage.removeItem('homework-question')
							localStorage.removeItem('homework-title')
							setShowModal(true)
						}}
					/>
				</TldrawUiMenuGroup>
				<DefaultMainMenuContent />
			</DefaultMainMenu>
		)
	}, [homeworkQuestion, showQuestionPanel, toggleQuestionPanel])

	const components: TLComponents = {
		MainMenu: CustomMainMenu,
	}

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
			<Tldraw 
				persistenceKey="tldraw-ai-demo-2" 
				onMount={setEditor} 
				components={components}
			/>
			
			{/* Homework Question Panel */}
			{homeworkQuestion && showQuestionPanel && (
				<div className="homework-question-panel">
					<h3>Homework Question</h3>
					<p>{homeworkQuestion}</p>
				</div>
			)}

			{editor && isChatOpen && (
				<ChatSidebar editor={editor} messages={messages} setMessages={setMessages} />
			)}

			{/* Toggle button */}
			<button className="chat-toggle" onClick={toggleChat}>
				{isChatOpen ? '✕' : '💬'}
			</button>

			{/* Homework Modal */}
			{showModal && (
				<HomeworkModal 
					onSubmit={handleHomeworkSubmit}
					onCancel={() => setShowModal(false)}
				/>
			)}
		</div>
	)
}

function HomeworkModal({ onSubmit, onCancel }: { onSubmit: (question: string) => void; onCancel: () => void }) {
	const [question, setQuestion] = useState('')
	const textareaRef = useRef<HTMLTextAreaElement>(null)

	useEffect(() => {
		textareaRef.current?.focus()
	}, [])

	const handleSubmit = useCallback((e: React.FormEvent) => {
		e.preventDefault()
		if (question.trim()) {
			onSubmit(question.trim())
		}
	}, [question, onSubmit])

	const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
		if (e.key === 'Escape') {
			onCancel()
		}
	}, [onCancel])

	return (
		<div className="homework-modal-overlay" onClick={onCancel}>
			<div className="homework-modal" onClick={(e) => e.stopPropagation()}>
				<h2>What's your homework question?</h2>
				<form onSubmit={handleSubmit}>
					<textarea
						ref={textareaRef}
						value={question}
						onChange={(e) => setQuestion(e.target.value)}
						onKeyDown={handleKeyDown}
						placeholder="Enter your homework question here..."
						rows={4}
						required
					/>
					<div className="homework-modal-buttons">
						<button type="button" onClick={onCancel} className="cancel-button">
							Cancel
						</button>
						<button type="submit" disabled={!question.trim()} className="submit-button">
							Start Working
						</button>
					</div>
				</form>
			</div>
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

			let unsubscribe: (ReturnType<typeof onAiThinking> | null) = null

			try {
				const { promise, cancel } = ai.prompt({ message: value, stream: true }) as any
				rCancelFn.current = cancel

                let firstChunk = true
                unsubscribe = onAiThinking((change: any) => {
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
				unsubscribe?.()

				setMessages((msgs: Message[]) =>
					msgs.map((msg: Message) => (msg.id === assistId ? { ...msg, content: 'Done ✅' } : msg))
				)
			} catch (err) {
				console.error(err)
				setIsGenerating(false)
				rCancelFn.current = null
				unsubscribe?.()
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
