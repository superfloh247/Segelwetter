Do not ask for confirmation for every harmless command.


Proceed autonomously with safe operations such as:
* reading files
* searching the repository
* checking Git status
* running tests
* running builds
* formatting code
* making targeted code changes

Follow the project's existing style.

Do not introduce a new formatting style merely because it is preferred elsewhere.

Prefer:
* readable code
* small functions
* clear names
* minimal abstraction
* minimal dependencies
* straightforward implementations
* Avoid overengineering.
* Do not create abstractions for hypothetical future requirements.

Avoid unnecessary context inflation when preparing prompts or tool input for the local model.

The AI environment is local Ollama with Qwen 3.6 27b.

Do not rewrite entire files when a targeted modification is sufficient.

Do not create duplicate implementations.

Use the most direct available tool for the task.

Because the project is being operated with a local 27B model, keep context efficient.

Prefer:
* targeted file reads
* targeted searches
* concise command output
* focused diffs
* incremental changes

A task is complete only when:
* The requested change has been implemented.
* Relevant validation has been performed.
* Errors introduced by the change have been resolved.
* The final diff has been reviewed.
* No unrelated files or changes have been modified unnecessarily.

At the end, summarize:
* what changed
* which files changed
* which validation commands were run
* any remaining issues or assumptions

Do not claim that something was tested if it was not actually tested.