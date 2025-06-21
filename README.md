# Tutor

An experiment with AI and whiteboards.

Tutor is an infinite canvas intended for students to complete homework problems. Each page is a question, and the AI is able to either chat or draw to help the student solve the problem.

For example, if you're given a basic problem like...

> A school auditorium has 18 rows with 32 seats in each row. If tickets cost $12 each, how much money would the school collect if every seat is sold?

The large language model can...

- Provide you hints
- Draw pictures to help you visualize the problem
- Correct your mistakes

## Notes for judges

- Relies on a mix of an infinite canvas and chat UI (that can interact with the canvas!)
- Entirely vibe-coded, mostly from 1pm; using Windsurf with a mix of o3, sonnet-3.7, and sonnet-4
- Persist user questions to local storage, and remembers past chats for prompt re-use
- Basic visuals that match the tldraw style

Future ideas...

- Students upload their homework PDF, and it's immediately broken into a series of question pages
- AI nudges students towards the correct answer as they work, catches mistakes as you go (instead of chat -- chat should be secondary)
