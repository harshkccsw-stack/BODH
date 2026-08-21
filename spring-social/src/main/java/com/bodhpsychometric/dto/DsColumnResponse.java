package com.bodhpsychometric.dto;

import com.bodhpsychometric.model.datastudio.DsDerivedColumn;

/** One computed column's definition, as the sheet header chip renders it. */
public record DsColumnResponse(
        Long dsDerivedColumnId,
        String colKey,
        String label,
        String expr,
        String evalTarget,
        String resultType,
        String format,
        int sortOrder) {

    public static DsColumnResponse from(DsDerivedColumn column) {
        return new DsColumnResponse(
                column.getDsDerivedColumnId(),
                column.getColKey(),
                column.getLabel(),
                column.getExpr(),
                column.getEvalTarget(),
                column.getResultType(),
                column.getFormat(),
                column.getSortOrder());
    }
}
