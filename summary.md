Design a modern cross-platform desktop app for Mac, Windows, and Linux that lets a user manage multiple active Claude Code agent sessions in one place.

Product goal:
Create a highly readable, chatbot-style workspace that feels intuitive like ChatGPT, but optimized for managing many coding agents at once. The app should reduce terminal clutter, make conversations easier to follow, and let the user monitor, reply to, and control active agent sessions from a single dashboard.

Core experience:
- A left sidebar with all active sessions, grouped by project or workspace
- A main chat area for the selected agent session
- A right-side details panel for session metadata, status, files changed, tasks, errors, and prompts
- A clean, modern, premium interface with excellent typography and spacing
- Dark mode first, but with light mode support
- Search, filters, unread indicators, and session status badges
- Human-in-the-loop controls so the user can approve, edit, or reply when an agent asks a question
- Ability to jump between sessions quickly
- Clear visual hierarchy so long technical conversations remain easy to read

Key screens:
1. Dashboard / all sessions
2. Single session chat view
3. Agent question / approval workflow
4. Project overview
5. Activity log / history
6. Settings

Important UX requirements:
- Make it feel more like ChatGPT than a terminal
- Keep the interface calm, minimal, and highly readable
- Use a command palette for fast actions
- Show session state clearly: running, waiting, blocked, completed, error
- Show agent messages, user replies, tool actions, and file changes in a structured feed
- Support multiple active sessions without overwhelming the user
- Make the app feel like a premium developer productivity tool

Visual style:
- Clean, modern, elegant, professional
- Similar polish to Cursor-level desktop tools
- Rounded cards, subtle dividers, soft shadows, strong spacing
- Simple iconography
- High-contrast text
- Dense enough for power users, but still easy to scan

Output:
Create the sitemap, user flows, and wireframes for this desktop app.


Implement this app in phases:

Phase 1:
- Desktop shell
- Left sidebar with sessions
- Main chat view
- Right details panel
- Mock session data
- Dark mode UI

Phase 2:
- Session state machine
- Reply box
- Approve/reject controls
- Unread indicators
- Search and filtering

Phase 3:
- Persistence
- Real session adapter layer
- Activity logs
- File change view
- Command palette

Phase 4:
- Polish
- Animations
- Keyboard shortcuts
- Empty states
- Error states
- Responsive layout

Before coding:
- Propose the best stack for cross-platform desktop development
- Keep the architecture modular
- Choose technologies that make the UI easy to maintain
- Then generate the full app structure and first working version


this is the project repo please use it and do not insert claudecode as an author.

https://github.com/Saad-Tarek/ccSessionManagement.git