import { TLAiChange, TLAiResult, TLAiSerializedPrompt } from '@tldraw/ai'
import OpenAI from 'openai'
import { TldrawAiBaseService } from '../../TldrawAiBaseService'
import { Environment } from '../../types'
import { generateEvents } from './generate'
import { getTldrawAiChangesFromSimpleEvents } from './getTldrawAiChangesFromSimpleEvents'
import { streamEvents } from './stream'
import { buildPromptMessages } from './prompt'

// Define interfaces for different response types
export interface AiResponse {
  responseType: 'chat' | 'drawing';
  content?: string;
  long_description_of_strategy?: string;
  events?: any[];
}

export class OpenAiService extends TldrawAiBaseService {
	openai: OpenAI

	constructor(env: Environment) {
		super(env)
		this.openai = new OpenAI({
			apiKey: env.OPENAI_API_KEY,
		})
	}
	
	// New method to process unified responses (chat or drawing)
	async processResponse(prompt: any): Promise<AiResponse> {
		try {
			// Use the OpenAI API to generate a response
			const completion = await this.openai.chat.completions.create({
				model: 'gpt-4o-2024-08-06',
				messages: buildPromptMessages(prompt),
				response_format: { type: "json_object" },
			});

			// Parse the response
			const responseContent = completion.choices[0]?.message?.content || '{}';
			const responseJson = JSON.parse(responseContent);
			
			if (this.env.LOG_LEVEL === 'debug') {
				console.log('AI response:', responseJson);
			}
			
			// Return the parsed response with type checking
			if (responseJson.responseType === 'chat') {
				return {
					responseType: 'chat',
					content: responseJson.content
				};
			} else {
				// For drawing responses, maintain compatibility with existing structure
				return {
					responseType: 'drawing',
					long_description_of_strategy: responseJson.long_description_of_strategy,
					events: responseJson.events
				};
			}
		} catch (error) {
			console.error('Process response error:', error);
			throw error;
		}
	}

	async generate(prompt: TLAiSerializedPrompt): Promise<TLAiResult> {
		const events = await generateEvents(this.openai, prompt)
		if (this.env.LOG_LEVEL === 'debug') console.log(events)
		const changes = events.map((event) => getTldrawAiChangesFromSimpleEvents(prompt, event)).flat()
		return { changes }
	}

	async generateTitle(prompt: { question: string; maxWords: number }): Promise<{ title: string }> {
		try {
			const completion = await this.openai.chat.completions.create({
				model: 'gpt-3.5-turbo',
				messages: [
					{
						role: 'system',
						content: `You are a helpful assistant that generates very short, concise titles from homework questions. Generate a title with exactly ${prompt.maxWords} words or fewer. Be concise and capture the essence of the question.`
					},
					{
						role: 'user',
						content: `Generate a ${prompt.maxWords}-word title for this homework question: "${prompt.question}"`
					}
				],
				max_tokens: 20,
				temperature: 0.7,
			})

			const title = completion.choices[0]?.message?.content?.trim() || ''
			
			// Ensure title doesn't exceed maxWords
			const words = title.split(' ')
			const finalTitle = words.slice(0, prompt.maxWords).join(' ')
			
			return { title: finalTitle }
		} catch (error) {
			console.error('Title generation error:', error)
			throw error
		}
	}

	async *stream(prompt: TLAiSerializedPrompt): AsyncGenerator<TLAiChange> {
		for await (const simpleEvent of streamEvents(this.openai, prompt)) {
			if (this.env.LOG_LEVEL === 'debug') console.log(simpleEvent)
			for (const change of getTldrawAiChangesFromSimpleEvents(prompt, simpleEvent)) {
				yield change
			}
		}
	}
}
