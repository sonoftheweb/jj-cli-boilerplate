
import * as p from "@clack/prompts";
import color from "picocolors";
import { createReadStream, existsSync, statSync, watch } from "node:fs";
import { parse } from "csv-parse";
import Table from "cli-table3";

function handleCancel() {
  p.cancel("Operation cancelled.");
  process.exit(0);
}

async function handleSearch() {
  const { filePath, searchTerm } = await p.group(
    {
      filePath: () =>
        p.text({
          message: "Enter the path to your CSV file:",
          placeholder: "./data.csv",
          initialValue: "./data.csv",
          validate: (value) => {
            if (!existsSync(value)) return "File not found!";
          },
        }),
      searchTerm: () =>
        p.text({
          message: "What do you want to search for?",
          validate: (value) => {
            if (!value) return "Search term cannot be empty!";
          },
        }),
    },
    { onCancel: handleCancel }
  );

  const spinner = p.spinner();
  spinner.start("Searching CSV file...");

  const parser = createReadStream(filePath).pipe(
    parse({
      columns: true,
      trim: true,
    })
  );

  const results: any[] = [];
  const lowerCaseSearch = searchTerm.toLowerCase();

  for await (const record of parser) {
    const found = Object.values(record).some((value) =>
      String(value).toLowerCase().includes(lowerCaseSearch)
    );
    if (found) {
      results.push(record);
    }
  }

  spinner.stop("Search complete.");

  if (results.length === 0) {
    p.log.info("No matching rows found.");
    return;
  }

  const headers = Object.keys(results[0]);
  const table = new Table({
    head: headers.map((h) => color.cyan(h)),
    colWidths: Array(headers.length).fill(20),
  });

  for (const row of results) {
    table.push(Object.values(row).map(cellValue => {
      if (Array.isArray(cellValue)) {
        return cellValue.join(', ');
      }
      return String(cellValue);
    }));
  }

  console.log(table.toString());
  console.log(`\n${results.length} matching rows found.`);
}

async function handleStream() {
  const { filePath } = await p.group(
    {
      filePath: () =>
        p.text({
          message: "Enter the path to the CSV file to watch:",
          placeholder: "./data.csv",
          initialValue: "./data.csv",
          validate: (value) => {
            if (!existsSync(value)) return "File not found!";
          },
        }),
    },
    { onCancel: handleCancel }
  );

  p.log.info(`Watching ${color.yellow(filePath)} for changes...`);
  p.log.message(`Try adding a new line to the file in another terminal:`);
  p.log.message(
    color.dim(`echo "106,Frank Moses,HR,Active,Paris" >> ${filePath}`)
  );
  p.log.message(`Press ${color.yellow("Ctrl+C")} to stop watching.`);

  let lastSize = statSync(filePath).size;
  const headers: string[] = [];

  const watcher = watch(filePath, async (event) => {
    if (event === "change") {
      const currentStats = statSync(filePath);
      if (currentStats.size > lastSize) {
        const stream = createReadStream(filePath, {
          start: lastSize,
          end: currentStats.size,
        });
        const parser = stream.pipe(parse({}));

        if (headers.length === 0 && lastSize === 0) {
          const headerStream = createReadStream(filePath).pipe(
            parse({ to_line: 1 })
          );
          for await (const record of headerStream) {
            headers.push(...record);
          }
        }

        for await (const record of parser) {
          if (headers.length > 0) {
            const table = new Table({
              head: headers.map((h) => color.cyan(h)),
            });
            table.push(record);
            console.log(color.green("\nNew row detected!"));
            console.log(table.toString());
          } else {
            p.log.info(record.join(", "));
          }
        }
        lastSize = currentStats.size;
      }
    }
  });

  process.on("SIGINT", () => {
    watcher.close();
    p.outro(color.yellow("Stopped watching file."));
    process.exit(0);
  });
}

async function main() {
  console.clear();
  p.intro(`${color.bgCyan(color.black(" CSV Utility "))}`);

  while (true) {
    const action = await p.select({
      message: "What would you like to do?",
      options: [
        { value: "search", label: "Search a CSV file" },
        { value: "stream", label: "Stream new content from a CSV file" },
        { value: "exit", label: "Exit" },
      ],
    });

    if (p.isCancel(action) || action === "exit") {
      if (p.isCancel(action)) handleCancel();
      break;
    }

    if (action === "search") {
      await handleSearch();
    }

    if (action === "stream") {
      await handleStream();
    }
  }

  p.outro("Have a great day!");
}

main().catch(console.error);
