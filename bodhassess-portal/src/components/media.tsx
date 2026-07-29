// Renders question/option media. Consolidates the Media component that was
// duplicated identically in the original take.tsx and preview.tsx.

function extractYoutubeId(url: string): string | null {
  const m = url?.match(
    /(?:youtube\.com\/(?:[^/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?/\s]{11})/,
  );
  return m ? m[1] : null;
}

// Map the backend's ContentType (TEXT/IMAGE/VIDEO/URL) + url onto the Media
// component's type prop. URL renders as an embedded YouTube player when it
// looks like one, otherwise as a plain outbound link.
export function mediaTypeFor(contentType?: string, url?: string | null): string | undefined {
  if (!url || !contentType || contentType === 'TEXT') return undefined;
  if (contentType === 'IMAGE') return 'image';
  if (contentType === 'VIDEO') return 'video';
  if (contentType === 'URL') return extractYoutubeId(url) ? 'youtube' : 'link';
  return undefined;
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
  if (type === 'link')
    return (
      <a href={url} target="_blank" rel="noreferrer" className="inline-block text-sm text-primary underline break-all">
        {url}
      </a>
    );
  return null;
}
