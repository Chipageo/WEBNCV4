import { render } from "preact"
import { App } from "./components/App"
import "./style/index.scss"
import "./targets/CNC/FluidNC/style/index.scss"

if (import.meta.env.DEV) {
    await import("preact/debug")
}

render(<App />, document.getElementById("app")!)
