import { ExecutionContext } from '@cloudflare/workers-types'
import { WorkerEntrypoint } from 'cloudflare:workers'
import { AutoRouter, cors, error, IRequest } from 'itty-router'
import { generate } from './routes/generate'
import { generateTitle } from './routes/generate-title'
import { stream } from './routes/stream'
import { process } from './routes/process'
import { Environment } from './types'

const { preflight, corsify } = cors({ origin: '*' })

const router = AutoRouter<IRequest, [env: Environment, ctx: ExecutionContext]>({
	before: [preflight],
	finally: [corsify],
	catch: (e) => {
		console.error(e)
		return error(e)
	},
})
	.post('/generate', generate)
	.post('/generate-title', generateTitle)
	.post('/stream', stream)
	.post('/process', process)

export default class extends WorkerEntrypoint<Environment> {
	override fetch(request: Request): Promise<Response> {
		return router.fetch(request, this.env, this.ctx)
	}
}

// Make the durable object available to the cloudflare worker
export { TldrawAiDurableObject } from './do/TldrawAiDurableObject'
