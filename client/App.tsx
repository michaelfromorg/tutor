import { FormEventHandler, useCallback, useEffect, useRef, useState, Dispatch, SetStateAction } from 'react'
import { DefaultSpinner, Editor, Tldraw, DefaultMainMenu, DefaultMainMenuContent, TldrawUiMenuItem, TldrawUiMenuGroup, TLComponents, TLPageId } from 'tldraw'
import { useTldrawAiExample, onAiThinking } from './useTldrawAiExample'

type Message = {
	id: string
	role: 'user' | 'assistant'
	content: string
	responseType?: 'chat' | 'drawing'
	strategy?: string
	intents?: string[]
}

function App() {
	const [editor, setEditor] = useState<Editor | null>(null)
	const [isChatOpen, setIsChatOpen] = useState(true)
	const [messages, setMessages] = useState<Message[]>([])
	const [homeworkQuestions, setHomeworkQuestions] = useState<Record<string, string>>({})
	const [currentPageId, setCurrentPageId] = useState<string | null>(null)
	const [showModal, setShowModal] = useState(false)
	const [showQuestionPanel, setShowQuestionPanel] = useState(false)
	const [includeHomeworkContext, setIncludeHomeworkContext] = useState(true)
	const SIDEBAR_WIDTH = 260

	const toggleChat = useCallback(() => setIsChatOpen((v) => !v), [])
	const toggleQuestionPanel = useCallback(() => setShowQuestionPanel((v) => !v), [])

	// Get current homework question for active page
	const currentHomeworkQuestion = currentPageId ? homeworkQuestions[currentPageId] : null
	const currentPageTitle = editor && currentPageId ? editor.getCurrentPage().name : 'Homework Helper'

	// Load homework questions from localStorage on mount
	useEffect(() => {
		const saved = localStorage.getItem('homework-questions')
		if (saved) {
			try {
				setHomeworkQuestions(JSON.parse(saved))
			} catch (e) {
				console.error('Error parsing homework questions:', e)
			}
		}
	}, [])

	// Save homework questions to localStorage
	useEffect(() => {
		if (Object.keys(homeworkQuestions).length > 0) {
			localStorage.setItem('homework-questions', JSON.stringify(homeworkQuestions))
		}
	}, [homeworkQuestions])

	// Update document title based on current page
	useEffect(() => {
		document.title = currentPageTitle
	}, [currentPageTitle])

	// Monitor page changes when editor is available
	useEffect(() => {
		if (!editor) return

		const updateCurrentPage = () => {
			const pageId = editor.getCurrentPageId()
			setCurrentPageId(pageId)
			
			// Show question panel if there's a question for this page
			if (homeworkQuestions[pageId]) {
				setShowQuestionPanel(true)
			} else {
				setShowQuestionPanel(false)
				// Show modal to prompt for homework question if no question exists
				setShowModal(true)
			}
		}

		// Set initial page
		updateCurrentPage()

		// Listen for page changes
		const unsubscribe = editor.store.listen(() => {
			const newPageId = editor.getCurrentPageId()
			if (newPageId !== currentPageId) {
				updateCurrentPage()
			}
		})

		return unsubscribe
	}, [editor, currentPageId, homeworkQuestions])

	// Generate AI title from homework question and rename the page
	const generateTitle = useCallback(async (question: string, pageId: string) => {
		if (!editor) return
		
		// Always create a fallback title first (max 3 words)
		const fallbackTitle = question.split(' ').slice(0, 3).join(' ')
		editor.renamePage(pageId as TLPageId, fallbackTitle)
		
		try {
			// Make direct API call to generate a 3-word title
			const response = await fetch('/generate-title', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({
					question: question,
					maxWords: 3
				})
			})
			
			if (response.ok) {
				const data = await response.json() as { title?: string }
				const generatedTitle = data.title?.trim()
				
				// Use generated title if it exists and is reasonable
				if (generatedTitle && generatedTitle.length > 0 && generatedTitle.length <= 50) {
					editor.renamePage(pageId as TLPageId, generatedTitle)
				}
			}
		} catch (err) {
			console.log('Title generation failed, using fallback:', err)
		}
	}, [editor])

	// Handle homework question submission
	const handleHomeworkSubmit = useCallback((question: string) => {
		if (!currentPageId) return
		
		setHomeworkQuestions(prev => ({ ...prev, [currentPageId]: question }))
		setShowModal(false)
		setShowQuestionPanel(true)
		generateTitle(question, currentPageId)
	}, [currentPageId, generateTitle])

	// Custom main menu component
	const CustomMainMenu = useCallback(() => {
		return (
			<DefaultMainMenu>
				<TldrawUiMenuGroup id="homework">
					{currentHomeworkQuestion && (
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
							if (currentPageId && editor) {
								const newQuestions = { ...homeworkQuestions }
								delete newQuestions[currentPageId]
								
								setHomeworkQuestions(newQuestions)
								setShowQuestionPanel(false)
								
								// Reset page name to default
								const currentPage = editor.getPage(currentPageId as TLPageId)
								editor.renamePage(currentPageId as TLPageId, `Page ${editor.getPages().indexOf(currentPage!) + 1}`)
								
								// Update localStorage
								if (Object.keys(newQuestions).length > 0) {
									localStorage.setItem('homework-questions', JSON.stringify(newQuestions))
								} else {
									localStorage.removeItem('homework-questions')
								}
								
								setShowModal(true)
							}
						}}
					/>
				</TldrawUiMenuGroup>
				<DefaultMainMenuContent />
			</DefaultMainMenu>
		)
	}, [currentHomeworkQuestion, showQuestionPanel, toggleQuestionPanel, currentPageId, homeworkQuestions, editor])

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

	return (
		<div className="tldraw-ai-container">
			<Tldraw
				components={components}
				onMount={(editor) => {
					setEditor(editor)
					;(window as any).editor = editor
					// Enable grid after mount
					editor.user.updateUserPreferences({ isSnapMode: false })
					// Try to enable grid via the UI state
					editor.setCurrentTool('select')
					// Enable grid mode - this might need to be done differently
					try {
						editor.updateInstanceState({ isGridMode: true })
					} catch (e) {
						console.log('Grid mode not available:', e)
					}
				}}
				persistenceKey="homework-app"
			/>

			{/* Homework Question Panel */}
			{currentHomeworkQuestion && showQuestionPanel && (
				<div className="homework-question-panel">
					<h3>Homework Question</h3>
					<p>{currentHomeworkQuestion}</p>
				</div>
			)}

			{editor && isChatOpen && (
				<ChatSidebar 
				editor={editor} 
				messages={messages} 
				setMessages={setMessages} 
				currentHomeworkQuestion={currentHomeworkQuestion}
				includeHomeworkContext={includeHomeworkContext}
				setIncludeHomeworkContext={setIncludeHomeworkContext}
			/>
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

function InputBar({ 
	editor, 
	setMessages, 
	currentHomeworkQuestion,
	includeHomeworkContext 
}: { 
	editor: Editor; 
	setMessages: Dispatch<SetStateAction<Message[]>>; 
	currentHomeworkQuestion: string | null;
	includeHomeworkContext: boolean;
}): JSX.Element {
	const [isGenerating, setIsGenerating] = useState(false)
	const rCancelFn = useRef<(() => void) | null>(null)
	const ai = useTldrawAiExample(editor)

	const nanoid = () => Math.random().toString(36).substring(2, 11);
	
	// Interface for AI response types
	interface AiResponse {
		responseType: 'chat' | 'drawing';
		content?: string;
		long_description_of_strategy?: string;
		events?: any[];
	}
	
	const handleSubmit = useCallback<FormEventHandler>(
		async (e) => {
			e.preventDefault()
			
			if (isGenerating || !editor) {
				return
			}
			
			const form = e.target as HTMLFormElement
			const formData = new FormData(form)
			const promptText = formData.get('input') as string
			if (!promptText?.trim()) return
			
			form.reset()
			
			// Add user's message to the chat
			const messageId = nanoid()
			setMessages((prev) => [...prev, { id: messageId, role: 'user', content: promptText }])
			
			// Generate a new message for the AI
			const assistId = nanoid()
			setMessages((prev) => [
				...prev,
				{
					id: assistId,
					role: 'assistant',
					content: 'Thinking...',
					strategy: '',
					intents: [],
				},
			])
			
			// Create prompt with homework context if enabled
			let fullPrompt = promptText
			if (currentHomeworkQuestion && includeHomeworkContext) {
				fullPrompt = `Homework Context: ${currentHomeworkQuestion}\n\nUser Question: ${promptText}`
			}

			// Capture the current state of the canvas as a data URL
			let drawingDataUrl: string | null = null
			try {
				if (editor) {
					// Get the current page ID
					const pageId = editor.getCurrentPageId()
					
					// Get all shapes on the current page
					const shapes = editor.getCurrentPageShapes()
					const shapeIds = shapes.map(shape => shape.id)
					
					if (shapeIds.length > 0) {
						// Get the SVG element for the current shapes
						const svg = await editor.getSvg(shapeIds)
						
						if (svg) {
							// Convert the SVG to a string
							const svgString = new XMLSerializer().serializeToString(svg)
							
							// Create a data URL from the SVG string
							drawingDataUrl = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgString)))
						}
					} else {
						console.log('No shapes found on current page')
					}
				}
			} catch (err) {
				console.error('Error capturing drawing:', err)
			}

      // No longer using the streaming approach for the new endpoint

      try {
        // Now we decide whether to use the new process endpoint or the streaming endpoint
        // Based on the memories, we know there's existing chat UI infrastructure already
        // For feature-parity, we'll start by always using the new process endpoint
        
        // Include drawing data in the prompt if available
        const promptData = { 
          message: fullPrompt,  // Use fullPrompt which may include homework context
          // We'll use non-streaming for the unified endpoint
          stream: false,
          // Add drawing data if available
          ...(drawingDataUrl ? { drawingImage: drawingDataUrl } : {})
        }
        
        // Debug log the prompt data
        console.log('Sending prompt to AI:', {
          promptText: fullPrompt,
          hasDrawing: !!drawingDataUrl,
          drawingDataUrlPrefix: drawingDataUrl ? drawingDataUrl.substring(0, 50) + '...' : 'none'
        })

        setIsGenerating(true)

        // Call the new process endpoint
        const response = await fetch('/process', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(promptData)
        });
        
        if (!response.ok) {
          throw new Error(`Server error: ${response.status}`);
        }
        
        const result = await response.json() as AiResponse;
        console.log('AI response:', result);
        
        // Using non-streaming approach now, so no need for unsubscribe
        
        // Handle different response types
        if (result.responseType === 'chat') {
          // For chat responses, simply update the message in the UI
          setMessages((prev) =>
            prev.map((m) => {
              if (m.id !== assistId) return m
              return { 
                ...m, 
                responseType: 'chat',
                content: result.content || 'No response content' 
              }
            })
          );
        } else {
          // For drawing responses, handle the new response structure
          console.log('Processing drawing response:', result);
          
          // Mark the message as a drawing response
          setMessages((prev) =>
            prev.map((m) => {
              if (m.id !== assistId) return m
              return { 
                ...m, 
                responseType: 'drawing',
                content: 'Drawing complete ✅',
                strategy: (result as any).strategy || '',
                intents: (result as any).events?.map((e: any) => e.intent || 'Unknown action') || []
              }
            })
          );
          
          // Process the drawing changes from the result
          if ((result as any).result && (result as any).result.changes && editor) {
            try {
              const changes = (result as any).result.changes;
              console.log('Applying', changes.length, 'drawing changes to editor');
              console.log('Full changes array:', JSON.stringify(changes, null, 2));
              
              // Apply each change to the editor
              changes.forEach((change: any, index: number) => {
                console.log(`Processing change ${index + 1}:`, JSON.stringify(change, null, 2));
                
                if (!change || typeof change !== 'object') {
                  console.warn(`Change ${index + 1} is invalid:`, change);
                  return;
                }
                
                try {
                  // Handle different types of AI changes
                  if (change.type === 'createShape' && change.shape) {
                    console.log(`Creating shape:`, change.shape);
                    editor.createShape(change.shape);
                  } else if (change.type === 'updateShape' && change.shape) {
                    console.log(`Updating shape:`, change.shape);
                    editor.updateShape(change.shape);
                  } else if (change.type === 'deleteShape' && change.shapeId) {
                    console.log(`Deleting shape:`, change.shapeId);
                    editor.deleteShape(change.shapeId);
                  } else if (change.type === 'createBinding' && change.binding) {
                    console.log(`Creating binding:`, change.binding);
                    editor.createBinding(change.binding);
                  } else if (change.type === 'deleteBinding' && change.bindingId) {
                    console.log(`Deleting binding:`, change.bindingId);
                    editor.deleteBinding(change.bindingId);
                  } else {
                    console.warn(`Unknown change type or missing data:`, change);
                  }
                } catch (changeError) {
                  console.error(`Error applying change ${index + 1}:`, changeError);
                  console.error('Change that failed:', JSON.stringify(change, null, 2));
                }
              });
            } catch (err) {
              console.error('Error applying drawing changes:', err);
            }
          } else {
            console.log('No drawing changes to apply or no editor available');
            console.log('Result structure:', JSON.stringify(result, null, 2));
          }
        }

        setIsGenerating(false)
        rCancelFn.current = null
      } catch (err) {
        console.error('AI processing error:', err)
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

function ChatSidebar({ 
	editor, 
	messages, 
	setMessages,
	currentHomeworkQuestion,
	includeHomeworkContext,
	setIncludeHomeworkContext
}: { 
	editor: Editor; 
	messages: Message[]; 
	setMessages: Dispatch<SetStateAction<Message[]>>;
	currentHomeworkQuestion: string | null;
	includeHomeworkContext: boolean;
	setIncludeHomeworkContext: Dispatch<SetStateAction<boolean>>;
}) {
	const endRef = useRef<HTMLDivElement>(null)
	useEffect(() => {
		endRef.current?.scrollIntoView({ behavior: 'smooth' })
	}, [messages])

	return (
		<div className="chat-sidebar">
			{currentHomeworkQuestion && (
				<div className="homework-context-toggle">
					<label>
						<input 
							type="checkbox" 
							checked={includeHomeworkContext} 
							onChange={(e) => setIncludeHomeworkContext(e.target.checked)} 
						/>
						Include homework context
					</label>
				</div>
			)}
			<div className="chat-log">
				{messages.map((message) => (
					<div key={message.id} className={`bubble ${message.role}`}>
						{message.role === 'user' ? (
							<p>{message.content}</p>
						) : (
							<>
								{/* Handle different response types */}
								{message.responseType === 'chat' ? (
									<div className="chat-response">
										<p>{message.content}</p>
									</div>
								) : (
									<>
										<p>{message.content}</p>
										{(message.strategy || (message.intents && message.intents.length > 0)) && (
											<details>
												<summary>AI Strategy & Actions</summary>
												{message.strategy && (
													<div className="strategy-section">
														<strong>Strategy</strong>
														<p>{message.strategy}</p>
													</div>
												)}
												{message.intents && message.intents.length > 0 && (
													<div className="intents-section">
														<strong>Actions Taken</strong>
														<ul className="intents-list">
															{message.intents.map((intent, i) => (
																<li key={i} className="intent-item">{intent}</li>
															))}
														</ul>
													</div>
												)}
											</details>
										)}
									</>
								)}
							</>
						)}
					</div>
				))}
				<div ref={endRef} />
			</div>
			<InputBar 
				editor={editor} 
				setMessages={setMessages} 
				currentHomeworkQuestion={currentHomeworkQuestion}
				includeHomeworkContext={includeHomeworkContext}
			/>
		</div>
	)
}

export default App
