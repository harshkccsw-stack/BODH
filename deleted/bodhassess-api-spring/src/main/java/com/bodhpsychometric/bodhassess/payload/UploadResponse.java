package com.bodhpsychometric.bodhassess.payload;

import com.fasterxml.jackson.annotation.JsonProperty;

public class UploadResponse {
    private String url;
    @JsonProperty("media_type") private String mediaType;
    private String filename;
    private long size;

    public UploadResponse() {}
    public UploadResponse(String url, String mediaType, String filename, long size) {
        this.url = url; this.mediaType = mediaType; this.filename = filename; this.size = size;
    }

    public String getUrl() { return url; }
    public void setUrl(String url) { this.url = url; }
    public String getMediaType() { return mediaType; }
    public void setMediaType(String mediaType) { this.mediaType = mediaType; }
    public String getFilename() { return filename; }
    public void setFilename(String filename) { this.filename = filename; }
    public long getSize() { return size; }
    public void setSize(long size) { this.size = size; }
}
