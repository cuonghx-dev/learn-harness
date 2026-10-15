// The Learn app's own MCP server (stdio, no dependencies). It exists so Claude
// can hand quiz grading back as structured data: the app reads `grade_quiz`'s
// input from the stream and renders the graded quiz card. The tool itself
// only acknowledges.
import { createInterface } from "node:readline"

const TOOLS = [
	{
		name: "grade_quiz",
		description:
			"Grade the learner's answers to the AskUserQuestion quiz that was just answered. Call it once, right after the answers arrive and before teaching on, with one result per question in the quiz's order. The app shows a ✓/✗ card from it, so do not repeat the verdicts in prose; build on them instead.",
		inputSchema: {
			type: "object",
			properties: {
				results: {
					type: "array",
					items: {
						type: "object",
						properties: {
							question: { type: "string", description: "The question text, as asked." },
							correct: {
								type: "array",
								items: { type: "string" },
								description: "The correct option label(s), exactly as offered; for open questions, a short model answer.",
							},
							ok: { type: "boolean", description: "Whether the learner's answer is correct. \"Tôi không biết\" is never correct." },
							explanation: { type: "string", description: "One or two sentences on why, in the learner's language." },
						},
						required: ["question", "correct", "ok", "explanation"],
					},
				},
			},
			required: ["results"],
		},
	},
]

const send = (msg) => process.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", ...msg })}\n`)

createInterface({ input: process.stdin }).on("line", (line) => {
	let req
	try {
		req = JSON.parse(line)
	} catch {
		return
	}
	const { id, method, params } = req
	if (id === undefined) return // notification
	switch (method) {
		case "initialize":
			return send({
				id,
				result: {
					protocolVersion: params?.protocolVersion ?? "2025-06-18",
					capabilities: { tools: {} },
					serverInfo: { name: "learn", version: "0.1.0" },
				},
			})
		case "ping":
			return send({ id, result: {} })
		case "tools/list":
			return send({ id, result: { tools: TOOLS } })
		case "tools/call":
			if (params?.name === "grade_quiz")
				return send({ id, result: { content: [{ type: "text", text: "Đã hiện kết quả chấm cho người học." }] } })
			return send({ id, error: { code: -32602, message: `unknown tool: ${params?.name}` } })
		default:
			return send({ id, error: { code: -32601, message: `method not found: ${method}` } })
	}
})
