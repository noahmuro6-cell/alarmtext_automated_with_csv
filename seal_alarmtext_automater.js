const Parameters = {
    introGroup: {
        type: "group",
        items: {
            introInfo: {
                type: "info",
                label: "Set Alarm Texts from CSV/Excel",
                description: "Writes alarm text and priority properties directly from a CSV/Excel list. Unlike search-and-replace, this SETS the exact value you provide.\n\nWorks directly with a Workstation Search export (English or German column headers): paste/export your alarm list, edit the value you want in the relevant column(s), and run this script as-is. If using Excel, save as \"CSV UTF-8 (Comma delimited)\". Make sure the file is closed before running the script.\n\nHow it works:\n- The path column is auto-detected by header name (LOCATION, PATH, FULLPATH, or Pfad). If none is found, the LAST column is used as the path.\n- Only these columns are written, if present:\n  Text: DESCR/Beschreibung, AlarmMessage/Alarmnachricht, ResetMessage/Nachricht bei zurückgesetzt, HighLimitMessage, LowLimitMessage, FaultMessage\n  Numeric: AlarmPriority/Alarmpriorität, ResetPriority/Priorität zurücksetzen (must be a whole number)\n  All other columns (TYPE, NAME, AlarmState, AcknowledgementMethod, DisabledByConfiguration, LOCATION, ...) are ignored — safe to leave them in the file unchanged.\n- Leave a cell empty to skip that property for that row.\n- A priority cell that is not a valid whole number is skipped and reported as an error, never guessed.\n\nUse Preview first to check what will be written, then Apply to commit the changes."
            }
        }
    },

    runMode: {
        type: "group",
        label: "Run Mode",
        description: "Choose whether to simulate or apply changes.",
        items: {
            mode: {
                type: "radioButton",
                label: "Mode",
                value: 0,
                tooltip: "Preview prints what would be written. Apply writes the values to EBO.",
                options: [
                    { label: "Preview (no changes)", value: 0, tooltip: "Safe dry run. Nothing is written to EBO." },
                    { label: "Apply (write changes)", value: 1, tooltip: "Writes the alarm text properties to EBO." }
                ]
            }
        }
    },

    searchFile: {
        type: "group",
        label: "Content",
        description: "CSV/Excel file containing the alarm paths and the texts to write.",
        items: {
            inputFile: {
                type: "openFile",
                label: "File:",
                value: "",
                configuration: {
                    filter: "Comma-separated files|*.csv|Text files|*.txt|All files|*.*"
                }
            }
        }
    }
}

async function OnRun() {
    const filePath = Parameters.searchFile.items.inputFile.value;
    if (!isNotEmpty(filePath)) throw "No file selected";

    const dataResult = await sealScript.fileSystem.readAllText(filePath);
    if (dataResult.failed) throw dataResult.message;

    const rows = CSV.parse(dataResult.returnValue).filter(x => x.length > 1);
    if (rows.length === 0) throw "No data found in file";

    const headers = rows.shift().map(h => (h || "").trim());

    // Auto-detect the path column by header name (English + German)
    const pathHeaderCandidates = ["location", "path", "fullpath", "pfad"];
    let pathColumnIndex = headers.findIndex(h => pathHeaderCandidates.includes(h.toLowerCase()));
    if (pathColumnIndex === -1) {
        pathColumnIndex = headers.length - 1; // fallback: last column
        r.warn(`No LOCATION/PATH/FULLPATH/Pfad header found, falling back to last column ("${headers[pathColumnIndex]}") as the alarm path.`);
    }

    // Maps recognised header names (English or German, case-insensitive) to the
    // canonical EBO property name that will actually be written.
    const HEADER_TO_PROPERTY = {
        "descr": "DESCR", "beschreibung": "DESCR",
        "alarmmessage": "AlarmMessage", "alarmnachricht": "AlarmMessage",
        "resetmessage": "ResetMessage", "nachricht bei zurückgesetzt": "ResetMessage",
        "highlimitmessage": "HighLimitMessage",
        "lowlimitmessage": "LowLimitMessage",
        "faultmessage": "FaultMessage",
        "alarmpriority": "AlarmPriority", "alarmpriorität": "AlarmPriority",
        "resetpriority": "ResetPriority", "priorität zurücksetzen": "ResetPriority",
    };
    // Properties in this list are written as whole numbers (Long), all others as plain text
    const NUMERIC_PROPERTIES = ["AlarmPriority", "ResetPriority"];

    const propertyColumns = headers
        .map((h, idx) => ({ property: HEADER_TO_PROPERTY[h.toLowerCase()], idx: idx }))
        .filter(({ property, idx }) => idx !== pathColumnIndex && property);

    if (propertyColumns.length === 0) {
        throw "No writable columns found. Expected one or more of: " + [...new Set(Object.values(HEADER_TO_PROPERTY))].join(", ");
    }

    const operation = Parameters.runMode.items.mode.value; // 0 = preview, 1 = apply

    r.log(`Loaded ${rows.length} rows from ${filePath}`);
    r.log(`Path column: "${headers[pathColumnIndex]}" (column ${pathColumnIndex + 1})`);
    r.log(`Writing columns: ${propertyColumns.map(p => `${headers[p.idx]} -> ${p.property}`).join(", ")}`);
    r.log("");

    let totalChanges = 0;
    let totalErrors = 0;

    for (const row of rows) {
        const alarmPath = (row[pathColumnIndex] || "").trim();
        if (!isNotEmpty(alarmPath)) continue;

        const existResult = await sdkClient.INavigate.DoesObjectExist({ objectPath: alarmPath });
        if (existResult.failed || !existResult.returnValue) {
            r.error("Alarm not found, skipping: " + alarmPath);
            totalErrors++;
            continue;
        }

        for (const { property: propertyName, idx } of propertyColumns) {
            const rawValue = row[idx];
            if (!isNotEmpty(rawValue)) continue;

            const propertyPath = alarmPath + "/" + propertyName;
            const isNumeric = NUMERIC_PROPERTIES.includes(propertyName);

            // Validate and prepare the value to write
            let valueToWrite = rawValue.trim();
            if (isNumeric) {
                if (!/^-?\d+$/.test(valueToWrite)) {
                    r.error(`Skipping ${propertyPath}: "${rawValue}" is not a whole number, refusing to guess.`);
                    totalErrors++;
                    continue;
                }
            }

            if (operation === 0) {
                r.log(`[Preview] ${propertyPath}  =>  ${isNumeric ? valueToWrite : `"${valueToWrite}"`}`);
                totalChanges++;
                continue;
            }

            const setResult = await sdkClient.IAdvanced.SetPropertyValue({
                propertyPath: propertyPath,
                value: isNumeric ? new Long(parseInt(valueToWrite, 10)) : valueToWrite
            });

            if (setResult.failed) {
                r.error(`Failed to set ${propertyPath}: ${setResult.message}`);
                totalErrors++;
            } else {
                r.log(`Set ${propertyPath}  =>  ${isNumeric ? valueToWrite : `"${valueToWrite}"`}`);
                totalChanges++;
            }
        }
    }

    if (operation === 1 && totalChanges > 0) {
        const saveResult = await sdkClient.ISession.Save({});
        if (saveResult.failed) {
            r.error("Failed to save session: " + saveResult.message);
        }
    }

    r.log("");
    r.log(`Done. ${totalChanges} ${operation === 0 ? "value(s) would be written" : "value(s) written"}${totalErrors > 0 ? `, ${totalErrors} error(s)` : ""}.`);
}


//region lib/reporting
/**
 * Reporting - logs to both SealScript log/result and browser console
 */
const r = {
    outputToLog: typeof (process) == "undefined",
    outputToResult: typeof (process) == "undefined",

    error: function (...args) {
        if (r.outputToLog) sealScript.log(["[Error]", ...args].join(" "));
        if (r.outputToResult) sealScript.result(["[Error]", ...args].join(" "));
        console.error.apply(null, args);
    },
    warn: function (...args) {
        if (r.outputToLog) sealScript.log(["[Warn]", ...args].join(" "));
        if (r.outputToResult) sealScript.result(["[Warn]", ...args].join(" "));
        console.warn.apply(null, args);
    },
    log: function (...args) {
        if (r.outputToLog) sealScript.log(["[Log]", ...args].join(" "));
        if (r.outputToResult) sealScript.result(["[Log]", ...args].join(" "));
        console.log.apply(null, args);
    },
}
//endregion lib/reporting

//region lib/isNotEmpty
function isNotEmpty(value) {
    if (value == null) return false;
    if (typeof (value) != "string") return false;
    return value.length > 0;
}
//endregion lib/isNotEmpty

//region lib/collections/csv
/**
 * CSV parser - parses CSV text into a two-dimensional array
 */
const CSV = {
    parse(text) {
        let textWithoutBom = text;
        if (text.startsWith("\uFEFF")) {
            textWithoutBom = text.substring(1);
        }

        const buffer = textWithoutBom.replaceAll("\r\n", "\n");
        const cellQuote = "\"";
        const cellSeparator = ";";
        const end = buffer.length;
        const rows = [];
        let cells = [];
        let offset = 0;
        let quoted = false;
        for (let i = 0; i < end; i++) {
            const isStartingQuote = !quoted && buffer[i] === cellQuote;
            const isEndingQuote = quoted && buffer[i] === cellQuote && i + 1 <= end && (buffer[i + 1] === cellSeparator || buffer[i + 1] === "\n");
            const isEscape = quoted && buffer[i] === cellQuote && i + 1 < end && buffer[i + 1] === cellQuote;

            if (isStartingQuote || isEndingQuote) {
                quoted = !quoted;
                continue;
            } else if (isEscape) {
                i++;
                continue;
            }

            if (buffer[i] === cellSeparator && !quoted) {
                cells.push(this.parseCSVCell(buffer, offset, i));
                offset = i + 1;
            } else if (buffer[i] === "\n" && !quoted) {
                cells.push(this.parseCSVCell(buffer, offset, i));
                rows.push(cells);
                cells = [];
                offset = i + 1;
            }
        }

        if (offset < end) {
            cells.push(this.parseCSVCell(buffer, offset, end));
        }

        if (buffer[end - 1] === cellSeparator) {
            cells.push("");
        }

        if (cells.length > 0) {
            rows.push(cells);
        }

        return rows;
    },

    parseCSVCell(buffer, offset, i) {
        const content = buffer.substring(offset, i);
        if (content.startsWith("\"") && content.endsWith("\"")) {
            return content.substring(1, content.length - 1).replaceAll("\"\"", "\"");
        } else {
            return content;
        }
    },
}
//endregion lib/collections/csv
