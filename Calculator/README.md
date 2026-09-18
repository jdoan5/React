# React Calculator (graded lab)

A simple calculator built for the Coursera graded lab — add, subtract, multiply, divide,
plus **Reset Input** and **Reset Result**. Division by zero shows an alert.

Built with **React 18 + Vite**. It was originally scaffolded with Create React App to match
the lab, but `react-scripts` is unmaintained and dragged in ~45 Dependabot advisories through
its build tooling, so the project was migrated to Vite. The app itself is unchanged.

## Run

```bash
npm install
npm start        # http://localhost:3000  (same port the lab instructions use)
npm run build    # production build -> dist/
```

`npm start` is kept as an alias for `vite` so the lab's instructions still apply verbatim.

## Lab parity

The lab's file is `src/App.js`; here it is **`src/App.jsx`**. Only the extension differs —
Vite treats JSX in `.js` as a syntax error, while `.jsx` needs no configuration at all. **The
file contents are byte-identical** (same SHA-256), so copying this file into the lab's
`src/App.js` still passes the grader.

> When submitting in the lab: open `src/App.jsx` here, copy **all** of it into the lab's
> `src/App.js`, **save (Ctrl+S — no ● on the tab)**, then grade.

## What the grader checks (all in `App.js`)

It matches the lab scaffold's own style closely, so the exact identifiers matter:

- `minus` / `times` are **function declarations** that declare
  `const inputVal = inputRef.current.value`, then call
  `setResult(result <op> Number(inputVal))` directly — *not* the updater-callback form
  `setResult(prev => ...)`
- `divide` declares `const inputVal = Number(inputRef.current.value)` and handles zero with
  `if (inputVal === 0) { alert(...) } else { ... }`
- `resetInput` is a **function declaration** that clears the field via
  `inputRef.current.value = ""` (double quotes)
- `resetResult` calls `setResult(0)`
- Every button is wired with `onClick`; every handler calls `e.preventDefault()` so the form
  doesn't reload the page

## Structure

```
Calculator/
├── index.html          # Vite entry (was public/index.html under CRA)
├── vite.config.js      # react plugin + port 3000
└── src/
    ├── App.jsx         # the graded component (paste into the lab's src/App.js)
    ├── index.jsx       # ReactDOM.createRoot entry
    ├── App.css         # lab-provided styling
    └── style.css       # part of the lab scaffold; currently unused
```
