import "dotenv/config";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";

import { initRepo } from "./vcs/init.js";
import { addRepo } from "./vcs/add.js";
import { commitRepo } from "./vcs/commit.js";
import { pushRepo } from "./vcs/push.js";
import { pullRepo } from "./vcs/pull.js";
import { revertRepo } from "./vcs/revert.js";

yargs(hideBin(process.argv))
  .scriptName("codeharbor")
  .command("init", "Initialise a new local repository", {}, initRepo)
  .command(
    "add <file>",
    "Add a file to the staging area",
    (y) => y.positional("file", { describe: "File to stage", type: "string" }),
    (argv) => addRepo(argv.file)
  )
  .command(
    "commit <message>",
    "Commit the staged files",
    (y) => y.positional("message", { describe: "Commit message", type: "string" }),
    (argv) => commitRepo(argv.message)
  )
  .command("push", "Push commits to S3", {}, pushRepo)
  .command("pull", "Pull commits from S3", {}, pullRepo)
  .command(
    "revert <commitID>",
    "Revert the working directory to a specific commit",
    (y) => y.positional("commitID", { describe: "Commit id to revert to", type: "string" }),
    (argv) => revertRepo(argv.commitID)
  )
  .demandCommand(1, "You need at least one command")
  .help().argv;
