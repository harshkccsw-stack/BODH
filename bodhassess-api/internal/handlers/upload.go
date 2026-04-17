package handlers

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"github.com/google/uuid"
)

type UploadHandler struct {
	uploadDir string
	baseURL   string
}

func NewUploadHandler(uploadDir, baseURL string) *UploadHandler {
	os.MkdirAll(uploadDir, 0755)
	return &UploadHandler{uploadDir: uploadDir, baseURL: baseURL}
}

func (h *UploadHandler) Upload(w http.ResponseWriter, r *http.Request) {
	// 50 MB max
	if err := r.ParseMultipartForm(50 << 20); err != nil {
		http.Error(w, `{"error":"file too large (max 50MB)"}`, http.StatusBadRequest)
		return
	}

	file, header, err := r.FormFile("file")
	if err != nil {
		http.Error(w, `{"error":"no file provided"}`, http.StatusBadRequest)
		return
	}
	defer file.Close()

	// Validate type
	ext := strings.ToLower(filepath.Ext(header.Filename))
	allowed := map[string]string{
		".jpg": "image", ".jpeg": "image", ".png": "image", ".gif": "image", ".webp": "image",
		".mp4": "video", ".webm": "video", ".mov": "video",
		".mp3": "audio", ".wav": "audio", ".ogg": "audio",
	}
	mediaType, ok := allowed[ext]
	if !ok {
		http.Error(w, `{"error":"unsupported file type. Use: jpg, png, gif, webp, mp4, webm, mov, mp3, wav"}`, http.StatusBadRequest)
		return
	}

	// Save with UUID filename
	id := uuid.New().String()
	filename := id + ext
	path := filepath.Join(h.uploadDir, filename)

	out, err := os.Create(path)
	if err != nil {
		http.Error(w, `{"error":"failed to save file"}`, http.StatusInternalServerError)
		return
	}
	defer out.Close()

	if _, err := io.Copy(out, file); err != nil {
		http.Error(w, `{"error":"failed to write file"}`, http.StatusInternalServerError)
		return
	}

	url := fmt.Sprintf("%s/uploads/%s", h.baseURL, filename)

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"url":        url,
		"media_type": mediaType,
		"filename":   header.Filename,
		"size":       header.Size,
	})
}
