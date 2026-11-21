import type { Page } from "@playwright/test";
import { expect, loginAs, test } from "./helpers";

const open = async (page: Page) => {
  await loginAs(page, "student");
  await page.goto("/student");
  await page.getByRole("button", { name: "Community" }).first().click();
};

test("students post with a photo, like and comment", async ({ page }) => {
  await open(page);
  await expect(page.getByRole("article").first()).toContainText("Welcome to our class community"); // pinned teacher post on top
  await page.getByLabel("Write a post").fill("Physics test moved to Sunday 5 PM!");
  await page.getByLabel("Photo").setInputFiles("e2e/fixtures/answer.jpg");
  await page.getByRole("button", { name: "Post", exact: true }).click();
  const post = page.getByRole("article", { name: "Post by Nusrat Jahan" }).first();
  await expect(post).toContainText("Physics test moved to Sunday 5 PM!");
  await expect(post.getByRole("img", { name: "Photo posted by Nusrat Jahan" })).toBeVisible();

  const other = page.getByRole("article").filter({ hasText: "pendulum practice problems" });
  await other.getByRole("button", { name: "Like", exact: true }).click();
  await expect(other.getByRole("button", { name: "Liked" })).toHaveAttribute("aria-pressed", "true");
  await other.getByRole("button", { name: "Comment", exact: true }).click();
  await other.getByRole("textbox", { name: /Comment on/ }).fill("Page 142, exercise 3");
  await other.getByRole("button", { name: "Send" }).click();
  await expect(other).toContainText("Page 142, exercise 3");
  await expect(other.getByRole("button", { name: "Comment", exact: true })).toHaveAttribute("title", "1 comment");
});

test("friends: accept a request, send one, and filter the feed to friends", async ({ page }) => {
  await open(page);
  await page.getByRole("tab", { name: /People/ }).click();
  await expect(page.getByRole("heading", { name: "Friend requests (1)" })).toBeVisible();
  await page.getByRole("button", { name: "Accept" }).first().click();
  await expect(page.getByRole("heading", { name: "My friends (2)" })).toBeVisible();
  const someone = page.getByRole("button", { name: /^Add .* as a friend$/ }).first();
  await someone.click();
  await expect(page.getByRole("button", { name: "Requested" }).first()).toBeVisible();
  await page.getByRole("tab", { name: "Friends", exact: true }).click();
  await expect(page.getByRole("article").filter({ hasText: "SHM formulas" })).toBeVisible(); // Rafsan is a friend
});

test("a reported post shows up for the teacher, who can remove it from students' feed", async ({ page }) => {
  await open(page);
  const post = page.getByRole("article").filter({ hasText: "pendulum practice problems" });
  await post.getByRole("button", { name: "More options" }).click();
  await page.getByRole("menuitem", { name: "Report" }).click();
  await expect(post.getByRole("img", { name: "Reported" })).toBeVisible();

  await loginAs(page, "teacher");
  await page.goto("/teacher");
  await page.getByRole("button", { name: "Tools" }).first().click();
  await page.getByRole("button", { name: /^Student community/ }).click();
  const modPost = page.getByRole("article").filter({ hasText: "pendulum practice problems" });
  await expect(modPost).toContainText("1 report");
  await modPost.getByRole("button", { name: "Remove" }).click();
  await expect(modPost).toContainText("Removed");

  await open(page);
  await expect(page.getByRole("article").filter({ hasText: "pendulum practice problems" })).toHaveCount(0);
});

test("social features: poll, privacy, bookmarks, profile, mute", async ({ page }) => {
  await open(page);
  // A poll seen by my batch only: vote, then the results show.
  const poll = page.getByRole("article").filter({ hasText: "Which chapter should we revise first" });
  await poll.getByRole("button", { name: "Gravitation" }).click();
  await expect(poll).toContainText("3 votes");
  // Post to friends only, with a poll.
  await page.getByLabel("Who can see this post").selectOption("friends");
  await page.getByLabel("Write a post").fill("Study group tonight? #physics");
  await page.getByRole("button", { name: "Poll" }).click();
  await page.getByLabel("Option 1").fill("Yes");
  await page.getByLabel("Option 2").fill("No");
  await page.getByRole("button", { name: "Post", exact: true }).click();
  await expect(page.getByRole("article").filter({ hasText: "Study group tonight?" })).toContainText("👥");
  // Hashtag search and bookmarks.
  await page.getByRole("button", { name: "#physics" }).first().click();
  await expect(page.getByLabel("Search posts, people or #tags")).toHaveValue("#physics");
  const shm = page.getByRole("article").filter({ hasText: "SHM formulas" });
  await page.getByLabel("Search posts, people or #tags").fill("");
  await shm.getByRole("button", { name: "Save post" }).click();
  await page.getByRole("tab", { name: "Saved" }).click();
  await expect(page.getByRole("article")).toHaveCount(1);
  // Profile, bio and privacy settings.
  await page.getByRole("tab", { name: "Profile" }).click();
  await page.getByRole("button", { name: "Edit profile" }).click();
  await page.getByLabel("About you").fill("HSC 2027 · science group");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("HSC 2027 · science group")).toBeVisible();
  await page.getByLabel("Who can send me friend requests").selectOption("none");
  // Mute someone from their profile: their posts leave my feed.
  await page.getByRole("tab", { name: "For you" }).click();
  await page.getByRole("article").filter({ hasText: "SHM formulas" }).getByRole("button", { name: "Rafsan Ahmed" }).first().click();
  await page.getByRole("button", { name: "Mute Rafsan Ahmed" }).click();
  await page.getByRole("button", { name: "Back" }).click();
  await expect(page.getByRole("article").filter({ hasText: "SHM formulas" })).toHaveCount(0);
});

test("unkind words: the post waits for a teacher, a rude reply is not sent", async ({ page }) => {
  await open(page);
  await page.getByLabel("Write a post").fill("you are all bastard people");
  await expect(page.getByText(/your teacher will check it before classmates see it/)).toBeVisible();
  await page.getByRole("button", { name: "Post", exact: true }).click();
  await expect(page.getByRole("article").filter({ hasText: "bastard people" })).toContainText("Waiting for your teacher to check this post");
  const other = page.getByRole("article").filter({ hasText: "pendulum practice problems" });
  await other.getByRole("button", { name: "Comment", exact: true }).click();
  await other.getByRole("textbox", { name: /Comment on/ }).fill("shut up harami");
  await other.getByRole("button", { name: "Send" }).click();
  await expect(other.getByRole("alert")).toContainText("Please remove unkind or rude words");
  await expect(other).not.toContainText("shut up harami", { ignoreCase: false, useInnerText: true });
});
