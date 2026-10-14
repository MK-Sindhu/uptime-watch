// Runs before the test files (see bunfig.toml). Plain axios calls (testUtils.ts,
// user.test.ts, website.test.ts) get one client address for this whole run,
// so running the tests again doesn't hit the sign-in limit (20 per 15 minutes
// per address). Clients from helpers.ts set their own address per file.
import axios from "axios";
import { randomTestAddress } from "./helpers";

axios.defaults.headers.common["X-Forwarded-For"] = randomTestAddress();
