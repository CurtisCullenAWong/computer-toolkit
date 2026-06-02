import { useState, useEffect } from "react";
import { FileText, Trash2, Check, Copy } from "lucide-react";

export default function QuickNotesPage() {
  const [notes, setNotes] = useState<string>(() => {
    return localStorage.getItem("toolkit_quick_notes") || "";
  });
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    localStorage.setItem("toolkit_quick_notes", notes);
  }, [notes]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(notes);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy notes: ", err);
    }
  };

  const handleClear = () => {
    if (window.confirm("Are you sure you want to clear your notes?")) {
      setNotes("");
    }
  };

  const wordsCount = notes.trim() === "" ? 0 : notes.trim().split(/\s+/).length;
  const charsCount = notes.length;

  return (
    <div className="flex flex-col h-[calc(100vh-180px)] max-w-4xl w-full bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-2xl shadow-sm p-6 overflow-hidden">
      <div className="flex items-center justify-between border-b border-[var(--border-color)] pb-4 mb-4">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-lg bg-[var(--accent-light)] text-[var(--accent-color)]">
            <FileText className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-[var(--text-primary)]">Quick Notes</h2>
            <p className="text-xs text-[var(--text-secondary)]">Your notes are automatically saved to local storage.</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleCopy}
            disabled={!notes}
            className="flex items-center gap-2 px-3.5 py-2 text-sm font-semibold rounded-lg bg-[var(--bg-sidebar-hover)] text-[var(--text-primary)] hover:bg-[var(--bg-select-trigger-hover)] disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            title="Copy to clipboard"
          >
            {copied ? (
              <>
                <Check className="w-4 h-4 text-emerald-500" />
                Copied
              </>
            ) : (
              <>
                <Copy className="w-4 h-4" />
                Copy Text
              </>
            )}
          </button>
          <button
            onClick={handleClear}
            disabled={!notes}
            className="flex items-center gap-2 px-3.5 py-2 text-sm font-semibold rounded-lg bg-red-500/10 text-red-500 hover:bg-red-500/20 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            title="Clear notes"
          >
            <Trash2 className="w-4 h-4" />
            Clear
          </button>
        </div>
      </div>

      <div className="flex-1 min-h-0 relative">
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Start typing your quick thoughts, commands, snippets, or tasks here..."
          className="w-full h-full p-4 rounded-xl border border-[var(--border-color)] bg-[var(--bg-primary)] text-[var(--text-primary)] placeholder-[var(--text-secondary)]/50 focus:outline-none focus:ring-2 focus:ring-[var(--accent-color)]/20 focus:border-[var(--accent-color)] resize-none font-sans text-[15px] leading-relaxed transition-all"
        />
      </div>

      <div className="flex items-center justify-between mt-4 text-xs text-[var(--text-secondary)] border-t border-[var(--border-color)] pt-3">
        <div className="flex gap-4">
          <span>
            Words: <strong className="text-[var(--text-primary)]">{wordsCount}</strong>
          </span>
          <span>
            Characters: <strong className="text-[var(--text-primary)]">{charsCount}</strong>
          </span>
        </div>
        <span className="italic">Auto-saved</span>
      </div>
    </div>
  );
}
