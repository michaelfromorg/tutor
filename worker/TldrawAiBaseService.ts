import { TLAiChange, TLAiResult, TLAiSerializedPrompt } from '@tldraw/ai'
import { Environment } from './types'
import { AiResponse } from './do/openai/OpenAiService'

export abstract class TldrawAiBaseService {
	constructor(public env: Environment) {}

	abstract generate(prompt: TLAiSerializedPrompt): Promise<TLAiResult>

	abstract generateTitle(prompt: { question: string; maxWords: number }): Promise<{ title: string }>

	abstract stream(prompt: TLAiSerializedPrompt): AsyncGenerator<TLAiChange>

	abstract processResponse(prompt: TLAiSerializedPrompt): Promise<AiResponse>
}
