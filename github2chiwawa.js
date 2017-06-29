var request = require('request'),
  config = require('./config.json');

function setJson(title, text, url) {
  var message = {
    text: title,
    toAll: "true",
    from: {
      name: "Github",
      userid: config.data.yanadabot_user_id
    }
  };

  if (text !== "") {
    message.attachments = [
      {
        attachmentId: "detail",
        viewType: "text",
        textType: "md",
        textInTimeline: "",
        text: text
        // actions: [
        //     {
        //         buttonTitle: "Github",
        //         actionUrl: url,
        //         actionType: "inAppBrowser",
        //         text: text
        //     }
        // ]                この書き方ではjsonに配列を追加することができない？[object object]になる
      }
    ];
  }
  return message;
}


exports.handler = function (event, context) {
  var msg = JSON.parse(event.body);
  var eventName = event.headers['X-GitHub-Event'];
  var title = "[" + msg.repository.full_name + "] ";
  var text = "";
  var url = "";
  var notify_flag = 0;
  const chiwawa_url = config.data.PROTCOL + config.data.chiwawa_conpany_id + "."
    + config.data.chiwawa_domain + config.data.chiwawa_message_endpoint + config.data.chiwawa_group_id + "/messages";

  for (var i = 1; i < config.allow_notify_list.length; i++) {
    if (msg.repository.full_name == config.allow_notify_list[i]) {
      notify_flag = 1;
    }
  }
  if (notify_flag == 0) {
    context.done();
    return;
  }


  switch (eventName) {
    case 'issue_comment':
    case 'pull_request_review_comment':
      const issue_comment_title = "#" + msg.issue.number + " " + msg.issue.title;
      var comment_type = (msg.issue.pul_request === undefined) ? 'Issue' : 'PullRequest';
      title += "New Comment by " + msg.comment.user.login;
      title += " on " + comment_type + " " + issue_comment_title;
      if (msg.issue.assignees.length !== 0) {
        title += "(assignd to ";
        for (var i = 0; i < msg.issue.assignees.length; i++) {
          if (i !== 0) {
            title += " and ";
          }
          title += msg.issue.assignees[i].login;
        }
        title += ")";
      }
      url = msg.issue.html_url;
      text += "[" + issue_comment_title + "]" + "(" + url + ")\n";
      text += msg.comment.body;
      break;
    case 'issues':
      const issue_title = "#" + msg.issue.number + " " + msg.issue.title;
      if (msg.action == 'opened') {
        title += 'Issue created by ' + msg.sender.login;
        if (msg.issue.assignees.length !== 0) {
          title += "(assignd to ";
          for (var i = 0; i < msg.issue.assignees.length; i++) {
            if (i !== 0) {
              title += " and ";
            }
            title += msg.issue.assignees[i].login;
          }
          title += ")";
        }
      }
      else if (msg.action == 'closed') {
        title += "Issue closed #" + issue_title;
        title += " by " + msg.sender.login;
      }
      url = msg.issue.html_url;
      text += "[" + issue_title + "]" + "(" + url + ")\n";
      text += msg.issue.body;

      break;
    case 'push':
      title += "[" + msg.repository.name + "]";
      if (msg.ref_type == 'branch') {
        title += 'New Branch ';
        title += '"' + msg.ref + '"';
        title += ' was Pushed by ';
        title += msg.head_commit.author.name;
      }
      else {
        title += msg.ref.replace("refs/heads/", "") + "was branched ";
        title += "from " + msg.repository.master_branch + " ";
        title += "and pushed by " + msg.head_commit.author.name;
      }

      url = msg.head_commit.url;
      break;
    case 'pull_request':
      if (msg.action == 'opened') {
        title += "PullRequest submitted by " + msg.sender.login;
      }
      else if (msg.action == 'closed') {
        title += "PullRequest closed :" + msg.pull_request.title;
        title += " by " + msg.sender.login;
      }
      url = msg.pull_request.html_url;
      text += "[" + msg.pull_request.body + "]" + "(" + url + ")";
      break;
    default :
      title += eventName + "の通知は現在実装中です";
  }

  // 知話輪へPOSTリクエスト
  request({
    url: chiwawa_url,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Chiwawa-API-Token': config.data.chiwawa_api_token
    },
    json: setJson(title,text,url)
  }, function () {

    context.done();
    return;
  });
};
