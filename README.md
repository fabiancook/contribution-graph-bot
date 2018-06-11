# Contribution Graph Bot

A "bot" that pushes to a github account each day to create a graphic using the contribution graph. 

The intention of the "bot" is to learn how to use both AWS lambda and the GitHub API. Please do not set this running on 
your profile just to get a fully green contribution graph, that would be dishonest. 

## How to run

Fork this project to your bots account (explained below).

You will need `node`, the `aws cli`, the `serverless cli` and `yarn`. 

You will also need a personal token for a github account, make a specific account for this so you don't change your main 
contribution graph, it needs to have access to "Private Repositories"

Once you have these dependencies invoke these commands in your CLI (Command Line Interface)

```bash
aws kms create-key
```

The above will give you a key with the value we want, the key is `Arn`, you will use this in the next steps

```bash
aws kms encrypt --key-id '<arn from previous step>' --plaintext '<github token>'
```

The above will give you a key with the value we want, the key is `CiphertextBlob`, you will use this in the deploy step

```bash
yarn install
```

Then run:

```bash
serverless deploy --github-token="kms:<encrypted token>" --github-user=<your new bot user> --github-repo=<this forked repo> --kms-key=<ARN For KMS key> --github-timezone=<Your bot profiles timezone>
```

Your bot will now run a few times a day to make sure your 

## Art Setup 

Modify `art.js` with these values related to the amount of commits to make in a single
day for a given timezone

- `0`: ` ` (Single space)
- `1`: `░`
- `2`: `▒`
- `3`: `▓`
- `4`: `█`

Each line in your art should be 52 characters long.

This is the starting point that I am working with

░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░
░▓░▓░▓▓▓░▓░░░▓░░░▓▓▓░░░░▓░░░▓░▓▓▓░▓▓▓░▓░░░▓▓░░░░░░░░
░▓░▓░▓░░░▓░░░▓░░░▓░▓░░░░▓░░░▓░▓░▓░▓░▓░▓░░░▓░▓░░░░░░░
░▓▓▓░▓▓▓░▓░░░▓░░░▓░▓░░░░▓░▓░▓░▓░▓░▓▓░░▓░░░▓░▓░░░░░░░
░▓░▓░▓░░░▓░░░▓░░░▓░▓░░░░▓░▓░▓░▓░▓░▓░▓░▓░░░▓░▓░░░░░░░
░▓░▓░▓▓▓░▓▓▓░▓▓▓░▓▓▓░░░░▓▓▓▓▓░▓▓▓░▓░▓░▓▓▓░▓▓░░░░░░░░
░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░