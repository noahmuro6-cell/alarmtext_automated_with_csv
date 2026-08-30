
# SEAL Alarm Text Automator

A SEAL script for Schneider Electric EcoStruxure Building Operation (EBO) that updates alarm texts and alarm priorities from a CSV export.

The script can process multiple alarms in one run, reducing repetitive manual work and helping maintain consistent alarm information.

## Features

- Imports alarm data from a CSV file
- Automatically detects the alarm path column
- Supports English and German column headers
- Updates text and priority properties
- Ignores unrelated columns safely
- Provides a preview mode without changing EBO
- Validates priority values before writing
- Reports missing alarms and invalid values
- Saves all successful changes in one session

## Supported properties

The following CSV columns are recognized:

| English header       | German header                    | EBO property         | Value type   |
| -------------------- | -------------------------------- | -------------------- | ------------ |
| `DESCR`            | `Beschreibung`                 | `DESCR`            | Text         |
| `AlarmMessage`     | `Alarmnachricht`               | `AlarmMessage`     | Text         |
| `ResetMessage`     | `Nachricht bei zurückgesetzt` | `ResetMessage`     | Text         |
| `HighLimitMessage` | —                               | `HighLimitMessage` | Text         |
| `LowLimitMessage`  | —                               | `LowLimitMessage`  | Text         |
| `FaultMessage`     | —                               | `FaultMessage`     | Text         |
| `AlarmPriority`    | `Alarmpriorität`              | `AlarmPriority`    | Whole number |
| `ResetPriority`    | `Priorität zurücksetzen`     | `ResetPriority`    | Whole number |

Header matching is case-insensitive.

## Alarm path detection

The script searches for one of the following column headers:

- `LOCATION`
- `PATH`
- `FULLPATH`
- `Pfad`

If none of these headers is found, the last column is used as the alarm path.

## Requirements

- Schneider Electric EcoStruxure Building Operation
- A compatible SEAL installation
- Permission to modify the relevant EBO objects
- A semicolon-separated CSV file
- Alarm paths that point to existing EBO objects

## CSV example

```csv
AlarmMessage;ResetMessage;AlarmPriority;ResetPriority;LOCATION
High temperature;Temperature normal;10;100;/Server 1/System/High temperature alarm
Low pressure;Pressure normal;20;100;/Server 1/System/Low pressure alarm
```

The separator must be a semicolon (`;`).

Empty cells are ignored. This makes it possible to update only selected properties without overwriting the others.

## Usage

1. Export the required alarm objects from an EBO WorkStation search.
2. Open the export in Excel or another spreadsheet application.
3. Add or edit the supported alarm text and priority columns.
4. Save the file as a semicolon-separated CSV file.
5. Close the CSV file before running the script.
6. Open the script in SEAL.
7. Select the CSV file.
8. Run the script in **Preview** mode.
9. Review the generated log carefully.
10. If the preview is correct, select **Apply** and run the script again.

## Run modes

### Preview

Preview mode performs a dry run. It shows which properties would be updated but does not write changes to EBO.

Using Preview before Apply is strongly recommended.

### Apply

Apply mode writes the supplied values to the corresponding EBO properties. After processing, the script saves the EBO session if at least one value was changed successfully.

## Validation and error handling

The script performs several checks:

- Rows without an alarm path are skipped.
- Alarm paths that do not exist in EBO are reported as errors.
- Empty property cells are skipped.
- Priority values must be valid whole numbers.
- Invalid priorities are never converted or guessed.
- Failed property updates are reported individually.
- Unrecognized columns are ignored.

## Important notes

- Always review the results in Preview mode first.
- Back up important EBO data before making large changes.
- Test the script with a small CSV file before processing many alarms.
- Make sure the CSV file is closed before starting the script.
- Verify that all alarm paths refer to the intended EBO objects.
- Check the SEAL log after every run.

## Repository contents

- `seal_alarmtext_automater.js` — SEAL automation script
- `doku/project_description/` — supporting project documentation

## Disclaimer

This script modifies properties in EcoStruxure Building Operation. Use it at your own risk and verify all input data before running Apply mode. The author is not responsible for incorrect values, unintended changes, or data loss caused by improper use.

## License

No license has currently been specified. Unless a license is added, the source code remains protected by copyright and may not automatically be reused, modified, or redistributed by others.
