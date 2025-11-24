import { Hello, type HelloOptions } from "./lib/hello.js";

const hello = new Hello({
  greeting: "Hi",
} as HelloOptions);

console.log(hello.greet("Jeff"));
