import path from "path";
import express, { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import studentRouter from "./student";
import adminRouter from "./admin";
import storageRouter from "./storage";

const router: IRouter = Router();

// Mount public static uploads folder for uploaded photos
const uploadsDir = path.resolve(process.cwd(), "uploads");
router.use("/storage/objects/uploads", express.static(uploadsDir));

router.use(healthRouter);
router.use(authRouter);
router.use(studentRouter);
router.use(adminRouter);
router.use(storageRouter);

export default router;
