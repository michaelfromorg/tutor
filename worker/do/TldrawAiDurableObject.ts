import type { TLAiResult, TLAiSerializedPrompt } from '@tldraw/ai'
import { DurableObject } from 'cloudflare:workers'
import { AutoRouter, error } from 'itty-router'
import { TldrawAiBaseService } from '../TldrawAiBaseService'
import { Environment } from '../types'
import { AiResponse, OpenAiService } from './openai/OpenAiService'
import { getTldrawAiChangesFromSimpleEvents } from './openai/getTldrawAiChangesFromSimpleEvents'

export class TldrawAiDurableObject extends DurableObject<Environment> {
	service: TldrawAiBaseService

	constructor(ctx: DurableObjectState, env: Environment) {
		super(ctx, env)
		this.service = new OpenAiService(this.env) // swap this with your own service
	}

	private readonly router = AutoRouter({
		catch: (e) => {
			console.error(e)
			return error(e)
		},
	})
		// when we get a connection request, we stash the room id if needed and handle the connection
		.post('/generate', (request) => this.generate(request))
		.post('/generate-title', (request) => this.generateTitle(request))
		.post('/stream', (request) => this.stream(request))
		.post('/process', (request) => this.processRequest(request))
		.post('/cancel', (request) => this.cancel(request))

	// `fetch` is the entry point for all requests to the Durable Object
	override fetch(request: Request): Response | Promise<Response> {
		return this.router.fetch(request)
	}

	/**
	 * Cancel the current stream.
	 *
	 * @param _request - The request object containing the prompt.
	 * @returns A Promise that resolves to a Response object containing the cancelled response.
	 */
	cancel(_request: Request) {
		return new Response('Not implemented', {
			status: 501,
		})
	}

	/**
	 * Generate a set of changes from the model.
	 *
	 * @param request - The request object containing the prompt.
	 * @returns A Promise that resolves to a Response object containing the generated changes.
	 */
	private async generate(request: Request) {
		const prompt = (await request.json()) as TLAiSerializedPrompt

		try {
			const response = await this.service.generate(prompt)

			// Send back the response as a JSON object
			return new Response(JSON.stringify(response), {
				headers: { 'Content-Type': 'application/json' },
			})
		} catch (error: any) {
			console.error('AI response error:', error)
			return new Response('An internal server error occurred.', {
				status: 500,
			})
		}
	}

	/**
	 * Generate a title from the model.
	 *
	 * @param request - The request object containing the prompt.
	 * @returns A Promise that resolves to a Response object containing the generated title.
	 */
	private async generateTitle(request: Request) {
		const prompt = (await request.json()) as { question: string; maxWords: number }

		try {
			const response = await this.service.generateTitle(prompt)

			// Send back the response as a JSON object
			return new Response(JSON.stringify(response), {
				headers: { 'Content-Type': 'application/json' },
			})
		} catch (error: any) {
			console.error('AI response error:', error)
			return new Response('An internal server error occurred.', {
				status: 500,
			})
		}
	}

	/**
	 * Stream changes from the model.
	 *
	 * @param request - The request object containing the prompt.
	 * @returns A Promise that resolves to a Response object containing the streamed changes.
	 */
	/**
	 * Process requests that can return either chat or drawing responses
	 * 
	 * @param request - The request object containing the prompt
	 * @returns A Promise that resolves to a Response object containing the processed response
	 */
	private async processRequest(request: Request): Promise<Response> {
		try {
			console.log('ProcessRequest: Starting to process request');
			const requestData: any = await request.json();
			console.log('ProcessRequest: Received data:', {
				hasMessage: !!requestData.message,
				hasDrawingImage: !!requestData.drawingImage,
				stream: requestData.stream,
				messageLength: requestData.message?.length || 0
			});
			
			// Create a proper TLAiSerializedPrompt from the request data
			const prompt: TLAiSerializedPrompt = {
				message: requestData.message || '',
				image: requestData.drawingImage || undefined,
				// Provide default promptBounds to avoid the error
				promptBounds: {
					x: 0,
					y: 0,
					w: 1000,
					h: 1000
				},
				// Provide default contextBounds
				contextBounds: {
					x: 0,
					y: 0,
					w: 1000,
					h: 1000
				},
				// Provide empty canvasContent
				canvasContent: {
					shapes: [],
					bindings: [],
					assets: []
				}
			};
			
			console.log('ProcessRequest: Created prompt object, calling service.processResponse');
			const response = await this.service.processResponse(prompt);
			console.log('ProcessRequest: Received response from service:', {
				responseType: response.responseType,
				hasContent: !!response.content,
				hasEvents: !!(response as any).events,
				eventsLength: (response as any).events?.length || 0
			});
			
			// If it's a chat response, return it directly
			if (response.responseType === 'chat') {
				console.log('ProcessRequest: Returning chat response');
				return new Response(JSON.stringify(response), {
					headers: { 'Content-Type': 'application/json' },
				});
			} 
			// If it's a drawing response, convert the events to TLAiChanges
			else {
				console.log('ProcessRequest: Processing drawing response');
				// Create a result with changes
				const result: TLAiResult = {
					changes: []
				};
				
				// Process each event through the existing conversion logic
				if (response.events && response.events.length > 0) {
					console.log('ProcessRequest: Converting events to TLAiChanges');
					for (const event of response.events) {
						const changes = getTldrawAiChangesFromSimpleEvents(prompt, event);
						result.changes.push(...changes);
					}
				}
				
				// Return the response with both the result and metadata for the frontend
				const drawingResponse = {
					responseType: 'drawing',
					result,
					strategy: response.long_description_of_strategy,
					events: response.events
				};
				
				console.log('ProcessRequest: Returning drawing response with', result.changes.length, 'changes');
				return new Response(JSON.stringify(drawingResponse), {
					headers: { 'Content-Type': 'application/json' },
				});
			}
		} catch (error) {
			console.error('Process request error:', error);
			return new Response(JSON.stringify({ 
				error: 'An internal server error occurred.',
				details: error instanceof Error ? error.message : 'Unknown error'
			}), { 
				status: 500,
				headers: { 'Content-Type': 'application/json' }
			});
		}
	}

	private async stream(request: Request): Promise<Response> {
		const encoder = new TextEncoder()
		const { readable, writable } = new TransformStream()
		const writer = writable.getWriter()

		const response: TLAiResult = {
			changes: [],
		}

		;(async () => {
			try {
				const prompt = await request.json()

				for await (const change of this.service.stream(prompt as TLAiSerializedPrompt)) {
					response.changes.push(change)
					const data = `data: ${JSON.stringify(change)}\n\n`
					await writer.write(encoder.encode(data))
					await writer.ready
				}
				await writer.close()
			} catch (error) {
				console.error('Stream error:', error)
				await writer.abort(error)
			}
		})()

		return new Response(readable, {
			headers: {
				'Content-Type': 'text/event-stream',
				'Cache-Control': 'no-cache, no-transform',
				Connection: 'keep-alive',
				'X-Accel-Buffering': 'no',
				'Transfer-Encoding': 'chunked',
				'Access-Control-Allow-Origin': '*',
				'Access-Control-Allow-Methods': 'POST, OPTIONS',
				'Access-Control-Allow-Headers': 'Content-Type',
			},
		})
	}
}
