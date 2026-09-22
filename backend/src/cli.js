require("dotenv").config();
const yargs = require("yargs");
const { hideBin } = require("yargs/helpers");

const { initRepo } = require("./vcs/init");
const { addRepo } = require("./vcs/add");
const { commitRepo } = require("./vcs/commit");
const { pushRepo } = require("./vcs/push");
const { pullRepo } = require("./vcs/pull");
const { revertRepo } = require("./vcs/revert");

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
