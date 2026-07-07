# React Calculator (graded lab)

A simple calculator built for the Coursera graded lab — add, subtract, multiply, divide,
plus **Reset Input** and **Reset Result**. Division by zero shows an alert.

Mirrors the lab's `my-calculator` structure (Create React App), so the code here can be
pasted straight into the lab workspace.

## Run

```bash
npm install
npm start        # http://localhost:3000
```

## What the grader checks (all in `src/App.js`)

- `plus` / `minus` / `times` / `divide` are **function declarations** that:
  - declare `const inputValue = Number(inputRef.current.value)`
  - call `setResult(result <op> inputValue)` directly (not the updater-callback form)
- `divide` handles division by zero with an `alert(...)` in an `if/else`
- `resetInput` is a function declaration clearing the field via `inputRef.current.value = ''`
- `resetResult` calls `setResult(0)`
- Every button is wired with `onClick` to its handler; handlers call `e.preventDefault()`
  so the form doesn't refresh the page

> When submitting in the lab: paste into `src/App.js`, **save (Ctrl+S — no ● on the tab)**,
> then grade.
