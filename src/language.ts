export function mimeToLanguage(mime: string): string {
    switch (mime.toLowerCase()) {
        // Markup
        case "text/html":
        case "application/xhtml+xml":
        case "application/xml":
        case "text/xml":
        case "application/mathml+xml":
        case "application/rss+xml":
        case "application/atom+xml":
            return "language-markup";

        // CSS
        case "text/css":
            return "language-css";

        // JavaScript
        case "text/javascript":
        case "application/javascript":
        case "application/ecmascript":
        case "text/ecmascript":
        case "application/x-javascript":
            return "language-javascript";

        // TypeScript
        case "text/typescript":
        case "application/typescript":
            return "language-typescript";

        // JSX / TSX
        case "text/jsx":
            return "language-jsx";
        case "text/tsx":
            return "language-tsx";

        // JSON
        case "application/json":
        case "text/json":
        case "application/ld+json":
            return "language-json";

        // YAML
        case "application/yaml":
        case "application/x-yaml":
        case "text/yaml":
        case "text/x-yaml":
            return "language-yaml";

        // TOML
        case "application/toml":
        case "text/toml":
            return "language-toml";

        // Markdown
        case "text/markdown":
        case "text/x-markdown":
            return "language-markdown";

        // Plain C family
        case "text/x-c":
        case "text/x-csrc":
            return "language-c";

        case "text/x-c++":
        case "text/x-c++src":
        case "text/x-cpp":
            return "language-cpp";

        case "text/x-chdr":
            return "language-c";

        case "text/x-c++hdr":
        case "text/x-hpp":
            return "language-cpp";

        // C#
        case "text/x-csharp":
        case "application/x-csharp":
            return "language-csharp";

        // Java
        case "text/x-java":
        case "text/x-java-source":
            return "language-java";

        // Kotlin
        case "text/x-kotlin":
        case "application/x-kotlin":
            return "language-kotlin";

        // Scala
        case "text/x-scala":
            return "language-scala";

        // Go
        case "text/x-go":
            return "language-go";

        // Rust
        case "text/x-rust":
            return "language-rust";

        // Swift
        case "text/x-swift":
            return "language-swift";

        // Python
        case "text/x-python":
        case "application/x-python-code":
            return "language-python";

        // Ruby
        case "text/x-ruby":
        case "application/x-ruby":
            return "language-ruby";

        // PHP
        case "application/x-httpd-php":
        case "text/x-php":
            return "language-php";

        // Perl
        case "text/x-perl":
        case "application/x-perl":
            return "language-perl";

        // Lua
        case "text/x-lua":
            return "language-lua";

        // Shell
        case "application/x-sh":
        case "text/x-shellscript":
        case "text/x-sh":
            return "language-bash";

        // PowerShell
        case "application/x-powershell":
        case "text/x-powershell":
            return "language-powershell";

        // SQL
        case "application/sql":
        case "text/sql":
            return "language-sql";

        // GraphQL
        case "application/graphql":
            return "language-graphql";

        // Dockerfile
        case "text/x-dockerfile":
            return "language-docker";

        // Makefile
        case "text/x-makefile":
            return "language-makefile";

        // Diff / Patch
        case "text/x-diff":
        case "text/x-patch":
            return "language-diff";

        // INI
        case "text/x-ini":
        case "application/ini":
            return "language-ini";

        // CSV
        case "text/csv":
            return "language-csv";

        // LaTeX
        case "application/x-latex":
        case "text/x-latex":
            return "language-latex";

        // Haskell
        case "text/x-haskell":
            return "language-haskell";

        // OCaml
        case "text/x-ocaml":
            return "language-ocaml";

        // Erlang
        case "text/x-erlang":
            return "language-erlang";

        // Elixir
        case "text/x-elixir":
            return "language-elixir";

        // Lisp
        case "text/x-lisp":
        case "text/x-common-lisp":
            return "language-lisp";

        // Scheme
        case "text/x-scheme":
            return "language-scheme";

        // R
        case "text/x-r-source":
            return "language-r";

        // MATLAB
        case "text/x-matlab":
            return "language-matlab";

        // Vim
        case "text/x-vim":
            return "language-vim";

        default:
            return "plaintext";
    }
}