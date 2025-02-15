import rehypeStringify from 'rehype-stringify';
import { remark } from 'remark';
import remarkRehype from 'remark-rehype';

import './markdown.scss'

export type DetailProps = { isLoading?: boolean, markdown?: string, navigationTitle?: string }
export const Detail = ({ markdown }: DetailProps) => {
  const processedContent = markdown
    ? remark()
        .use(remarkRehype)
        .use(rehypeStringify)
        .processSync(markdown)
        .toString()
    : '';
  return (
    <div className="flex markdown-body" dangerouslySetInnerHTML={{ __html: processedContent }} />
  );
};
