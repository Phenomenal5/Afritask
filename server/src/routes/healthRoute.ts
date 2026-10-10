import express from "express";
import { liveness, readiness } from "../controllers/health.controller.js";


const router = express.Router();

// Probes for hosts and load balancers: no auth, no rate limit, GET only.
router.get("/", liveness);
router.get("/ready", readiness);


export default router;
