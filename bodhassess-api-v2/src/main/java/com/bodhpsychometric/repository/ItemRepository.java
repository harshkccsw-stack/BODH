package com.bodhpsychometric.repository;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;

import com.bodhpsychometric.model.item.Item;
import com.bodhpsychometric.model.item.ItemFormat;
import com.bodhpsychometric.model.item.ValidationStatus;

/**
 * The item bank. Items are immutable content nodes — services must never
 * update content columns of a persisted row; edits go through the
 * copy-on-write path (new Item with previousItem set).
 */
public interface ItemRepository extends JpaRepository<Item, Long> {

    List<Item> findByDeletedAtIsNull();

    Optional<Item> findByIdAndDeletedAtIsNull(Long id);

    List<Item> findByDeletedAtIsNotNull();

    List<Item> findByFormatAndDeletedAtIsNull(ItemFormat format);

    List<Item> findByValidationStatusAndDeletedAtIsNull(ValidationStatus validationStatus);

    List<Item> findByStemContainingIgnoreCaseAndDeletedAtIsNull(String stem);

    /** Direct successors of an item version (lineage children). */
    List<Item> findByPreviousItemId(Long previousItemId);

    boolean existsByPreviousItemId(Long previousItemId);
}
