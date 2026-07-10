import { useRef, useState } from "react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";

interface UploadResult {
  successful: Array<{ uploadURL: string }>;
  failed: Array<unknown>;
}

interface ObjectUploaderProps {
  maxNumberOfFiles?: number;
  maxFileSize?: number;
  onGetUploadParameters: () => Promise<{
    method: "PUT";
    url: string;
  }>;
  onComplete?: (result: UploadResult) => void;
  buttonClassName?: string;
  children: ReactNode;
}

export function ObjectUploader({
  maxFileSize = 10485760,
  onGetUploadParameters,
  onComplete,
  buttonClassName,
  children,
}: ObjectUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const handleClick = () => {
    inputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > maxFileSize) {
      alert(`El archivo es demasiado grande. Máximo ${Math.round(maxFileSize / 1024 / 1024)} MB.`);
      return;
    }

    setUploading(true);
    try {
      const { url } = await onGetUploadParameters();
      const response = await fetch(url, {
        method: "PUT",
        body: file,
        headers: { "Content-Type": file.type },
      });

      if (!response.ok) throw new Error("Upload failed");

      onComplete?.({
        successful: [{ uploadURL: url }],
        failed: [],
      });
    } catch (err) {
      console.error("Upload error:", err);
      onComplete?.({ successful: [], failed: [err] });
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        style={{ display: "none" }}
        onChange={handleFileChange}
      />
      <Button
        type="button"
        onClick={handleClick}
        disabled={uploading}
        className={buttonClassName}
      >
        {uploading ? "Subiendo..." : children}
      </Button>
    </div>
  );
}
