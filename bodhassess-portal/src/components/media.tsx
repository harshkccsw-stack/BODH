// Renders question/option media. Consolidates the Media component that was
// duplicated identically in the original take.tsx and preview.tsx.

function extractYoutubeId(url: string): string | null {
  const m = url?.match(
    /(?:youtube\.com\/(?:[^/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?/\s]{11})/,
  );
  return m ? m[1] : null;
}

export function Media({ url, type }: { url?: string; type?: string }) {
  if (!url || !type || type === 'none') return null;
  if (type === 'image') return <img src={url} alt="" className="max-h-72 rounded-lg border border-border" />;
  if (type === 'video') return <video src={url} controls className="max-h-72 rounded-lg border border-border" />;
  if (type === 'youtube') {
    const id = extractYoutubeId(url);
    return id ? (
      <iframe
        src={`https://www.youtube.com/embed/${id}`}
        className="w-full aspect-video rounded-lg border border-border"
        allowFullScreen
      />
    ) : null;
  }
  if (type === 'audio') return <audio src={url} controls className="w-full" />;
  return null;
}
