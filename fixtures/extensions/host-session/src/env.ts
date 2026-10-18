export default async function command() {
  console.log(
    `secret=${process.env.BLAST_TEST_SECRET ?? "unset"} path=${process.env.PATH ? "set" : "unset"}`,
  );
  for (let index = 0; index < 5; index++) console.log(`line ${index}`);
}
