import { IRequest } from 'itty-router'
import { Environment } from '../types'

export async function process(request: IRequest, env: Environment) {
	// Use the same durable object as other routes
	const id = env.TLDRAW_AI_DURABLE_OBJECT.idFromName('anonymous')
	const DO = env.TLDRAW_AI_DURABLE_OBJECT.get(id)
	const response = await DO.fetch(request.url, {
		method: 'POST',
		body: request.body as any,
	})

	// Return the response with proper content type
	return new Response(response.body as BodyInit, {
		headers: { 'Content-Type': 'application/json' },
	})
}
