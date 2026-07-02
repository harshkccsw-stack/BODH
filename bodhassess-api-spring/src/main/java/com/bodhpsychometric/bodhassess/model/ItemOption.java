package com.bodhpsychometric.bodhassess.model;

import java.util.ArrayList;
import java.util.List;

import javax.persistence.CascadeType;
import javax.persistence.Column;
import javax.persistence.Entity;
import javax.persistence.FetchType;
import javax.persistence.GeneratedValue;
import javax.persistence.GenerationType;
import javax.persistence.Id;
import javax.persistence.JoinColumn;
import javax.persistence.ManyToOne;
import javax.persistence.OneToMany;
import javax.persistence.Table;

/**
 * One MCQ option attached to an {@link Item}. Replaces the option entries in
 * the legacy items.options JSON array. Order matters (option 0 vs option 1)
 * and is captured by {@link #sortOrder}.
 */
@Entity
@Table(name = "item_options")
public class ItemOption {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "item_id", nullable = false)
    private Item item;

    @Column(name = "sort_order", nullable = false)
    private int sortOrder;

    @Column(columnDefinition = "text")
    private String text;

    @Column(name = "media_url", columnDefinition = "text")
    private String mediaUrl;

    @Column(name = "media_type")
    private String mediaType;

    // Per-MQT scoring for this option — was a nested array in the JSON blob.
    @OneToMany(mappedBy = "option", cascade = CascadeType.ALL, orphanRemoval = true,
            fetch = FetchType.EAGER)
    private List<ItemOptionScore> scores = new ArrayList<>();

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public Item getItem() { return item; }
    public void setItem(Item item) { this.item = item; }
    public int getSortOrder() { return sortOrder; }
    public void setSortOrder(int sortOrder) { this.sortOrder = sortOrder; }
    public String getText() { return text; }
    public void setText(String text) { this.text = text; }
    public String getMediaUrl() { return mediaUrl; }
    public void setMediaUrl(String mediaUrl) { this.mediaUrl = mediaUrl; }
    public String getMediaType() { return mediaType; }
    public void setMediaType(String mediaType) { this.mediaType = mediaType; }
    public List<ItemOptionScore> getScores() { return scores; }
    public void setScores(List<ItemOptionScore> scores) { this.scores = scores; }
}
