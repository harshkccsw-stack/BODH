package com.bodhpsychometric.bodhassess.payload;

// Lightweight projection used by the assessment-create dropdown. Skips the
// MQ tree and question snapshot so the list endpoint doesn't pay for tens of
// MBs of payload when the caller only needs label + counts.
public class QuestionnaireSummaryDto {
    private String id;
    private String name;
    private String shortName;
    private String vertical;
    private String category;
    private Integer duration;
    private Integer itemCount;

    public QuestionnaireSummaryDto() {}

    // JPQL constructor expression target. SIZE(q.questions) comes back as
    // Integer from Hibernate, so the param type must match exactly or the
    // query fails to bind.
    public QuestionnaireSummaryDto(String id, String name, String shortName, String vertical,
                                   String category, Integer duration, Integer itemCount) {
        this.id = id;
        this.name = name;
        this.shortName = shortName;
        this.vertical = vertical;
        this.category = category;
        this.duration = duration;
        this.itemCount = itemCount;
    }

    public String getId() { return id; }
    public void setId(String id) { this.id = id; }
    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    public String getShortName() { return shortName; }
    public void setShortName(String shortName) { this.shortName = shortName; }
    public String getVertical() { return vertical; }
    public void setVertical(String vertical) { this.vertical = vertical; }
    public String getCategory() { return category; }
    public void setCategory(String category) { this.category = category; }
    public Integer getDuration() { return duration; }
    public void setDuration(Integer duration) { this.duration = duration; }
    public Integer getItemCount() { return itemCount; }
    public void setItemCount(Integer itemCount) { this.itemCount = itemCount; }
}
