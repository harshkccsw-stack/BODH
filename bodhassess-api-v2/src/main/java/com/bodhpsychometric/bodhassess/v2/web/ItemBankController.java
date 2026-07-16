package com.bodhpsychometric.bodhassess.v2.web;

import java.util.List;
import java.util.Set;

import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import com.bodhpsychometric.bodhassess.domain.item.AnswerOption;
import com.bodhpsychometric.bodhassess.domain.item.Item;
import com.bodhpsychometric.bodhassess.domain.item.ItemFormat;
import com.bodhpsychometric.bodhassess.domain.item.ValidationStatus;
import com.bodhpsychometric.bodhassess.domain.repository.ItemRepository;
import com.bodhpsychometric.bodhassess.domain.service.ItemBankService;
import com.bodhpsychometric.bodhassess.domain.service.ItemBankService.ItemContent;
import com.bodhpsychometric.bodhassess.domain.service.ItemBankService.OptionContent;

@RestController
@RequestMapping("/api/v2/items")
public class ItemBankController {

    public record OptionRequest(String text, String mediaUrl, String mediaType) {}
    public record ItemRequest(ItemFormat format, String stem, String mediaUrl, String mediaType,
                              List<OptionRequest> options, Set<String> languages) {}
    public record StatusRequest(ValidationStatus status) {}

    public record OptionDto(Long id, int sortOrder, String text, String mediaUrl, String mediaType) {
        static OptionDto from(AnswerOption o) {
            return new OptionDto(o.getId(), o.getSortOrder(), o.getText(), o.getMediaUrl(), o.getMediaType());
        }
    }

    public record ItemDto(Long id, ItemFormat format, String stem, String mediaUrl, String mediaType,
                          ValidationStatus validationStatus, Long previousItemId, List<OptionDto> options) {
        static ItemDto from(Item item) {
            return new ItemDto(item.getId(), item.getFormat(), item.getStem(), item.getMediaUrl(),
                    item.getMediaType(), item.getValidationStatus(),
                    item.getPreviousItem() == null ? null : item.getPreviousItem().getId(),
                    item.getOptions().stream().map(OptionDto::from).toList());
        }
    }

    private final ItemBankService itemBank;
    private final ItemRepository itemRepository;

    public ItemBankController(ItemBankService itemBank, ItemRepository itemRepository) {
        this.itemBank = itemBank;
        this.itemRepository = itemRepository;
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public ItemDto create(@RequestBody ItemRequest body) {
        return ItemDto.from(itemBank.createItem(toContent(body), body.languages()));
    }

    /** Copy-on-write: returns the NEW item version; nothing is repointed. */
    @PostMapping("/{id}/edit")
    @ResponseStatus(HttpStatus.CREATED)
    public ItemDto edit(@PathVariable Long id, @RequestBody ItemRequest body) {
        return ItemDto.from(itemBank.editAsNewVersion(id, toContent(body)));
    }

    @GetMapping("/{id}")
    public ItemDto get(@PathVariable Long id) {
        return ItemDto.from(itemBank.get(id));
    }

    @GetMapping
    public List<ItemDto> list(@RequestParam(required = false) String search,
                              @RequestParam(required = false) ItemFormat format) {
        List<Item> items;
        if (search != null && !search.isBlank()) {
            items = itemRepository.findByStemContainingIgnoreCaseAndDeletedAtIsNull(search);
        } else if (format != null) {
            items = itemRepository.findByFormatAndDeletedAtIsNull(format);
        } else {
            items = itemRepository.findByDeletedAtIsNull();
        }
        return items.stream().map(ItemDto::from).toList();
    }

    @GetMapping("/{id}/successors")
    public List<ItemDto> successors(@PathVariable Long id) {
        return itemBank.versionSuccessors(id).stream().map(ItemDto::from).toList();
    }

    @PutMapping("/{id}/validation-status")
    public ItemDto setStatus(@PathVariable Long id, @RequestBody StatusRequest body) {
        return ItemDto.from(itemBank.setValidationStatus(id, body.status()));
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void bin(@PathVariable Long id) {
        itemBank.binItem(id);
    }

    @PostMapping("/{id}/restore")
    public void restore(@PathVariable Long id) {
        itemBank.restoreItem(id);
    }

    private static ItemContent toContent(ItemRequest body) {
        List<OptionContent> options = body.options() == null ? List.of()
                : body.options().stream()
                        .map(o -> new OptionContent(o.text(), o.mediaUrl(), o.mediaType()))
                        .toList();
        return new ItemContent(body.format(), body.stem(), body.mediaUrl(), body.mediaType(), options);
    }
}
