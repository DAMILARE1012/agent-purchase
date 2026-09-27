"use client";

import { useEffect, useRef, useState } from "react";
import { Alert, Button } from "@/components/ui";
import { useReceiptScan } from "../hooks/useReceiptScan";
import { decodeQrFromVideo } from "../lib/decodeQr";
import { extractToken } from "../lib/token";

type CameraState = "idle" | "starting" | "scanning" | "denied" | "unsupported";

export function CameraScanner() {
  const { run } = useReceiptScan();
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const frameRef = useRef<number | null>(null);
  const [state, setState] = useState<CameraState>("idle");

  function stop() {
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    frameRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }

  useEffect(() => stop, []);

  function scanFrame() {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (video && canvas && video.readyState >= video.HAVE_CURRENT_DATA) {
      const text = decodeQrFromVideo(video, canvas);
      const token = text ? extractToken(text) : null;
      if (token) {
        stop();
        setState("idle");
        run({ token, source: "webcam" });
        return;
      }
    }
    frameRef.current = requestAnimationFrame(scanFrame);
  }

  async function start() {
    if (!navigator.mediaDevices?.getUserMedia) {
      setState("unsupported");
      return;
    }
    setState("starting");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      streamRef.current = stream;
      const video = videoRef.current!;
      video.srcObject = stream;
      await video.play();
      setState("scanning");
      frameRef.current = requestAnimationFrame(scanFrame);
    } catch {
      stop();
      setState("denied");
    }
  }

  const active = state === "starting" || state === "scanning";

  return (
    <div className="flex flex-col gap-3">
      <div className="relative aspect-video w-full max-w-full overflow-hidden rounded-lg bg-ink">
        <video ref={videoRef} muted playsInline className="size-full object-cover" hidden={!active} />
        {!active && (
          <div className="absolute inset-0 grid place-items-center p-6 text-center text-sm text-canvas/80">
            Point your camera at the receipt&apos;s QR code.
          </div>
        )}
        {state === "scanning" && (
          <div aria-hidden="true" className="pointer-events-none absolute inset-[18%] rounded-lg border-2 border-white/80" />
        )}
      </div>
      <canvas ref={canvasRef} hidden />
      <div className="flex gap-2">
        {active ? (
          <Button
            variant="secondary"
            onClick={() => {
              stop();
              setState("idle");
            }}
          >
            Stop camera
          </Button>
        ) : (
          <Button onClick={start}>Start camera</Button>
        )}
      </div>
      {state === "denied" && (
        <Alert tone="ai" title="Camera not available">
          Allow camera access in your browser settings, or upload a screenshot instead.
        </Alert>
      )}
      {state === "unsupported" && (
        <Alert tone="ai" title="This browser can't use the camera here">
          Upload a screenshot or paste the receipt link instead.
        </Alert>
      )}
    </div>
  );
}
