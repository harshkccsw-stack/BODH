package com.bodhpsychometric.service;

import com.bodhpsychometric.exception.ValidationException;
import com.bodhpsychometric.exception.ConflictException;
import com.bodhpsychometric.exception.NotFoundException;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Set;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.bodhpsychometric.model.item.AnswerOption;
import com.bodhpsychometric.model.item.Item;
import com.bodhpsychometric.model.item.ItemFormat;
import com.bodhpsychometric.model.item.ValidationStatus;
import com.bodhpsychometric.repository.ItemRepository;
import com.bodhpsychometric.repository.QuestionnaireItemRepository;

/**
 * The item bank. The central contract — items are IMMUTABLE — is enforced
 * here by construction: there is no method that updates content of a
 * persisted item. Editing is {@link #editAsNewVersion}, which mints a new
 * Item chained via previousItem; repointing questionnaires to it is a
 * separate, explicit authoring act (QuestionnaireAuthoringService).
 */
@Service
@Transactional
public class ItemBankService {

    /** Content payload for create/edit — options in display (authoring) order. */
    public record OptionContent(String text, String mediaUrl, String mediaType) {}

    public record ItemContent(ItemFormat format, String stem, String mediaUrl, String mediaType,
                              List<OptionContent> options) {}

    private final ItemRepository itemRepository;
    private final QuestionnaireItemRepository usageRepository;

    public ItemBankService(ItemRepository itemRepository, QuestionnaireItemRepository usageRepository) {
        this.itemRepository = itemRepository;
        this.usageRepository = usageRepository;
    }

    public Item createItem(ItemContent content, Set<String> languages) {
        validate(content);
        Item item = buildFrom(content, null);
        if (languages != null) item.setLanguages(languages);
        return itemRepository.save(item);
    }

    /**
     * Copy-on-write: a brand-new Item (and option rows) carrying the edited
     * content, chained to the original. Nothing is repointed automatically —
     * every questionnaire keeps the version it was using until its author
     * explicitly replaces it.
     */
    public Item editAsNewVersion(Long itemId, ItemContent content) {
        Item previous = liveItem(itemId);
        validate(content);
        Item next = buildFrom(content, previous);
        next.setLanguages(previous.getLanguages() == null ? null : Set.copyOf(previous.getLanguages()));
        // Metadata starts fresh where it is version-specific, carries where it isn't.
        next.setValidationStatus(ValidationStatus.DRAFT);
        next.setIrtA(previous.getIrtA());
        next.setIrtB(previous.getIrtB());
        next.setIrtC(previous.getIrtC());
        next.setRiskFlag(previous.isRiskFlag());
        next.setRiskRule(previous.getRiskRule());
        next.setSubDomain(previous.getSubDomain());
        return itemRepository.save(next);
    }

    /** Workflow metadata is mutable in place — never copy-on-write. */
    public Item setValidationStatus(Long itemId, ValidationStatus status) {
        Item item = liveItem(itemId);
        item.setValidationStatus(status);
        return item;
    }

    public void binItem(Long itemId) {
        Item item = liveItem(itemId);
        if (usageRepository.existsByItemId(itemId)) {
            throw new ConflictException("Item " + itemId
                    + " is used by one or more questionnaires — remove those usages first");
        }
        item.moveToBin(OffsetDateTime.now());
    }

    public void restoreItem(Long itemId) {
        itemRepository.findById(itemId)
                .orElseThrow(() -> new NotFoundException("Item", itemId))
                .restoreFromBin();
    }

    @Transactional(readOnly = true)
    public Item get(Long itemId) {
        return liveItem(itemId);
    }

    @Transactional(readOnly = true)
    public List<Item> versionSuccessors(Long itemId) {
        return itemRepository.findByPreviousItemId(itemId);
    }

    // ── internals ────────────────────────────────────────────────────────

    private Item buildFrom(ItemContent content, Item previous) {
        Item item = new Item();
        item.setFormat(content.format());
        item.setStem(content.stem());
        item.setMediaUrl(content.mediaUrl());
        item.setMediaType(content.mediaType());
        item.setPreviousItem(previous);
        int order = 0;
        if (content.options() != null) {
            for (OptionContent oc : content.options()) {
                AnswerOption option = new AnswerOption();
                option.setSortOrder(order++);
                option.setText(oc.text());
                option.setMediaUrl(oc.mediaUrl());
                option.setMediaType(oc.mediaType());
                item.addOption(option);
            }
        }
        return item;
    }

    private void validate(ItemContent content) {
        if (content.format() == null) {
            throw new ValidationException("format is required");
        }
        boolean hasStem = content.stem() != null && !content.stem().isBlank();
        boolean hasMedia = content.mediaUrl() != null && !content.mediaUrl().isBlank();
        if (!hasStem && !hasMedia) {
            throw new ValidationException("an item needs a stem or media");
        }
        int optionCount = content.options() == null ? 0 : content.options().size();
        if (content.format() == ItemFormat.FREE_TEXT) {
            if (optionCount != 0) {
                throw new ValidationException("FREE_TEXT items take no options");
            }
        } else if (optionCount < 2) {
            // The old system's rule: every non-FREE_TEXT format needs >= 2 options
            // (this is exactly the C9 unanswerable-item bug, now unrepresentable).
            throw new ValidationException(content.format() + " items need at least 2 options");
        }
    }

    private Item liveItem(Long id) {
        return itemRepository.findByIdAndDeletedAtIsNull(id)
                .orElseThrow(() -> new NotFoundException("Item", id));
    }
}
