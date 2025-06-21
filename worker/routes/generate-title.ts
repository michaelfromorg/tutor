import { IRequest } from 'itty-router'
import { Environment } from '../types'

export async function generateTitle(request: IRequest, env: Environment) {
	// Use the same pattern as other routes - forward to the durable object
	const id = env.TLDRAW_AI_DURABLE_OBJECT.idFromName('anonymous')
	const DO = env.TLDRAW_AI_DURABLE_OBJECT.get(id)
	const response = await DO.fetch(request.url, {
		method: 'POST',
		body: request.body as any,
	})

	// Return new response to avoid immutable headers error from cors middleware
	return new Response(response.body as BodyInit, {
		headers: { 'Content-Type': 'application/json' },
	})
}
