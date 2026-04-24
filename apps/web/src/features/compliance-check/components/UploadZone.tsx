'use client';

import { useRef } from 'react';
import { Upload, FileText, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

interface UploadZoneProps {
  file: File | null;
  loading: boolean;
  onFileChange: (file: File) => void;
  onSubmit: () => void;
}

export function UploadZone({ file, loading, onFileChange, onSubmit }: UploadZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (selected) onFileChange(selected);
  };

  return (
    <div className="space-y-4">
      <div
        className="border-2 border-dashed rounded-lg p-8 text-center cursor-pointer hover:border-primary/50 transition-colors"
        onClick={() => inputRef.current?.click()}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".pdf,.txt,.text"
          onChange={handleChange}
          className="hidden"
        />
        {file ? (
          <div className="flex items-center justify-center gap-2">
            <FileText className="w-5 h-5 text-primary" />
            <span className="text-sm font-medium">{file.name}</span>
            <Badge variant="outline" className="text-xs">
              {(file.size / 1024).toFixed(0)} KB
            </Badge>
          </div>
        ) : (
          <div className="space-y-2">
            <Upload className="w-8 h-8 mx-auto text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              사업계획서를 여기에 끌어다 놓거나 클릭하여 선택하세요
            </p>
            <p className="text-xs text-muted-foreground">PDF, TXT 지원 (최대 20MB)</p>
          </div>
        )}
      </div>

      <Button
        onClick={onSubmit}
        disabled={loading || !file}
        className="w-full h-12 text-base font-semibold"
        size="lg"
      >
        {loading ? (
          <>
            <Loader2 className="w-5 h-5 mr-2 animate-spin" />
            컴플라이언스 분석 중...
          </>
        ) : (
          <>
            <FileText className="w-5 h-5 mr-2" />
            컴플라이언스 체크 시작
          </>
        )}
      </Button>
    </div>
  );
}
