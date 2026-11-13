import './index.css'

/* For its side effect: installs the mailbox before React mounts, so a host's
   greeting that arrives early is held rather than lost — and the error
   reporter, so a page that fails tells the host why. */
import 'kehikot-module-protocol/client'
/* The page in StrictMode, inside ReportErrors: a render that throws is said to the host. */
import { mountPage } from 'kehikot-module-protocol/client/mount'
import { App } from './app.tsx'

mountPage('root', <App />)
