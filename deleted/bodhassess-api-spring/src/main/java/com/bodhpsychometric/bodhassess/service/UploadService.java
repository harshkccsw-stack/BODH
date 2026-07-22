package com.bodhpsychometric.bodhassess.service;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

import javax.annotation.PostConstruct;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import com.bodhpsychometric.bodhassess.config.AppProperties;
import com.bodhpsychometric.bodhassess.exception.BadRequestException;
import com.bodhpsychometric.bodhassess.exception.ServiceException;
import com.bodhpsychometric.bodhassess.payload.UploadResponse;

@Service
public class UploadService {

    private static final Map<String, String> ALLOWED_EXT = new HashMap<>();
    static {
        for (String e : new String[]{"jpg", "jpeg", "png", "gif", "webp"}) ALLOWED_EXT.put("." + e, "image");
        for (String e : new String[]{"mp4", "webm", "mov"}) ALLOWED_EXT.put("." + e, "video");
        for (String e : new String[]{"mp3", "wav", "ogg"}) ALLOWED_EXT.put("." + e, "audio");
    }

    @Autowired
    private AppProperties appProperties;

    @PostConstruct
    public void init() throws IOException {
        Files.createDirectories(Paths.get(appProperties.getUploads().getDir()));
    }

    public UploadResponse save(MultipartFile file) {
        if (file == null || file.isEmpty()) {
            throw new BadRequestException("no file provided");
        }
        String original = file.getOriginalFilename() == null ? "" : file.getOriginalFilename();
        int dot = original.lastIndexOf('.');
        String ext = dot >= 0 ? original.substring(dot).toLowerCase() : "";
        String mediaType = ALLOWED_EXT.get(ext);
        if (mediaType == null) {
            throw new BadRequestException("unsupported file type. Use: jpg, png, gif, webp, mp4, webm, mov, mp3, wav");
        }

        String filename = UUID.randomUUID() + ext;
        Path dest = Paths.get(appProperties.getUploads().getDir(), filename);
        try {
            Files.copy(file.getInputStream(), dest);
        } catch (IOException e) {
            throw new ServiceException("failed to save file", e);
        }

        String url = appProperties.getUploads().getBaseUrl() + "/uploads/" + filename;
        return new UploadResponse(url, mediaType, original, file.getSize());
    }
}
